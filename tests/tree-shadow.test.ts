import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { main, processRun } from "./helpers.ts";

// Opt-in: source repositories are read only; every jj operation runs in a detached copy.
// DX_TREE_BASELINE points to an extracted pre-change dx checkout with dependencies installed.
test.skipIf(process.env.DX_TREE_SHADOW !== "1")(
  "real repository API migration parity and timing",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "dx-tree-shadow-"));
    const receipts = [];
    for (const [name, source] of [
      ["retrospectives", "/home/fuyu/Workspace/retrospectives.ws/ws_pin-dx"],
      ["soks", "/home/fuyu/Workspace/soks.ws/ws_dx-shadow"],
    ] as const) {
      const cwd = join(root, name);
      await cp(source, cwd, {
        recursive: true,
        filter: (path) =>
          ![".git", ".jj", "node_modules", "target", ".cocoindex_code"].includes(basename(path)),
      });
      const run = async (cmd: string[]) => {
        const result = await processRun(cwd, cmd, 120000);
        expect(result.exit, result.stderr).toBe(0);
        return result;
      };
      await run(["jj", "git", "init", "--colocate"]);
      await run(["jj", "status"]);
      const measure = async (entry: string) => {
        const start = performance.now();
        const result = await processRun(
          cwd,
          [process.execPath, entry, "check", "--base", "@", "@"],
          120000,
        );
        expect(result.exit, result.stderr).toBe(0);
        return { ...result, seconds: (performance.now() - start) / 1000 };
      };
      const baseline = process.env.DX_TREE_BASELINE;
      expect(baseline).toBeDefined();
      const before = await measure(join(baseline ?? "", "src/main.ts"));
      const compatible = await measure(main);
      expect(compatible.stdout).toBe(before.stdout);
      if (name === "soks") {
        const helper = join(cwd, ".dx/helpers/check.ts");
        let check = await readFile(helper, "utf8");
        check = check
          .replace("Check, FindingInput", "TreeCheck, FindingInput")
          .replace("check: Check = (record, tree)", "check: TreeCheck = (tree)")
          .replace("  if (tree.records[0] !== record) return [];\n", "")
          .replace(
            "  const core =",
            `  const ids = new Map([...tree.index.byId].filter(([id]) => /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)).map(([id, rows]) => [id.slice(9), rows]));\n  const core =`,
          )
          .replace("identity(docs)", "identity(docs, ids)")
          .replace("triad(docs)", "triad(docs, ids)")
          .replace("citations(docs)", "citations(docs, ids)")
          .replace("supersedes(docs, core", "supersedes(docs, ids, core");
        await Bun.write(helper, check);
        const type = join(cwd, ".dx/helpers/type.ts");
        await Bun.write(
          type,
          (await readFile(type, "utf8")).replace(
            "checks: [check]",
            'treeChecks: role === "evi" ? [check] : []',
          ),
        );
        await Promise.all(
          ["identity", "triad", "citations", "supersedes"].map(async (helperName) => {
            const path = join(cwd, `.dx/helpers/${helperName}.ts`);
            await Bun.write(
              path,
              (await readFile(path, "utf8"))
                .replace("owners, ", "")
                .replace(
                  "docs: readonly Doc[]",
                  "docs: readonly Doc[], ids: ReadonlyMap<string, readonly Doc[]>",
                )
                .replace("const ids = owners(docs);", "")
                .replace("owners(docs).values()", "ids.values()"),
            );
          }),
        );
        const common = join(cwd, ".dx/helpers/common.ts");
        await Bun.write(
          common,
          (await readFile(common, "utf8"))
            .replace("ids: Map<string, Doc[]>", "ids: ReadonlyMap<string, readonly Doc[]>")
            .replace(
              "return rows?.length === 1 ? rows : [];",
              "return rows?.length === 1 ? [...rows] : [];",
            ),
        );
        const config = join(cwd, "dx.toml");
        await Bun.write(
          config,
          (await readFile(config, "utf8")).replace("[files]", '[files]\ninputs = [".leakcheck"]'),
        );
      } else {
        const path = join(cwd, ".dx/retro.ts");
        await Bun.write(
          path,
          (await readFile(path, "utf8"))
            .replace(
              "tree.records[0]?.id === record.id ? layoutFindings(Object.keys(tree.files)) : []",
              "[]",
            )
            .replace(
              "  ],\n};",
              `  ],\n  treeChecks: [(tree) => layoutFindings(Object.keys(tree.files)).map(row => ({\n    check: "retro.layout", id: tree.records[0]?.id, path: row.path, field: row.problem, message: row.problem,\n  }))],\n};`,
            ),
        );
      }
      await run(["jj", "status"]);
      const after = await measure(main);
      // Save a readable difference before asserting so a refutation has concrete evidence.
      const receipt = {
        baselineCommit: process.env.DX_TREE_BASELINE_REV,
        measuredAt: Temporal.Now.instant().toString(),
        comparison: "dx check --base @ @; exact stdout equality; one wall-clock sample per variant",
        name,
        source,
        copy: cwd,
        findings: before.stdout.trim().split("\n").filter(Boolean).length,
        equalLegacy: compatible.stdout === before.stdout,
        equalMigrated: after.stdout === before.stdout,
        beforeSeconds: before.seconds,
        compatibleSeconds: compatible.seconds,
        afterSeconds: after.seconds,
        beforeExit: before.exit,
        afterExit: after.exit,
        stdoutSha256: new Bun.CryptoHasher("sha256").update(after.stdout).digest("hex"),
      };
      receipts.push(receipt);
      if (after.stdout !== before.stdout) {
        await Bun.write(join(root, `${name}-before.jsonl`), before.stdout);
        await Bun.write(join(root, `${name}-after.jsonl`), after.stdout);
      }
      await Bun.write(join(root, "receipt.json"), JSON.stringify(receipts, null, 2));
      if (process.env.DX_TREE_RECEIPT !== undefined)
        await Bun.write(process.env.DX_TREE_RECEIPT, JSON.stringify(receipts, null, 2) + "\n");
      process.stderr.write(`${JSON.stringify(receipt)}\n`);
      expect(after.stdout).toBe(before.stdout);
    }
    // Copies intentionally retained for inspecting the migrated policy and rerunning the receipt.
    process.stderr.write(`Shadow copies: ${root}\n`);
  },
  300000,
);
