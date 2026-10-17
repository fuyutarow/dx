import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, processRun, rows } from "./helpers.ts";

// Opt-in, detached copies only. The source snapshots are the prior YAML shadow
// run's independent repositories, whose provenance is in strict-yaml-shadow.json.
test.skipIf(process.env.DX_STRICT_INPUT_SHADOW !== "1")(
  "explicit-key and document-domain shadow comparison",
  async () => {
    const baseline = process.env.DX_STRICT_INPUT_BASELINE;
    expect(baseline).toBeDefined();
    const root = await mkdtemp(join(tmpdir(), "dx-strict-input-shadow-"));
    const comparisons = [];
    for (const [name, policy] of [
      ["retrospectives", "original"],
      ["soks", "original"],
      ["soks", "builtin"],
    ] as const) {
      const source = `/tmp/dx-yaml-shadow/${name}`;
      const cwd = join(root, `${name}-${policy}`);
      await cp(source, cwd, { recursive: true });
      const run = async (cmd: string[]) => processRun(cwd, cmd, 300000);
      expect((await run(["jj", "status"])).exit).toBe(0);
      const head = await run([
        "jj",
        "--ignore-working-copy",
        "log",
        "--no-graph",
        "-r",
        "@",
        "-T",
        "commit_id",
      ]);
      expect(head.exit).toBe(0);
      if (policy === "builtin") {
        const path = join(cwd, ".dx/helpers/type.ts");
        const original = await readFile(path, "utf8");
        expect(original).toContain('import { format } from "./format.ts";');
        await Bun.write(
          path,
          original
            .replace('import { format } from "./format.ts";', "")
            .replace("format,", 'format: "markdown-frontmatter",'),
        );
        expect((await run(["jj", "status"])).exit).toBe(0);
      }
      const before = await run([
        process.execPath,
        join(baseline ?? "", "src/main.ts"),
        "check",
        "--base",
        "root()",
      ]);
      process.stderr.write(`${name} ${policy} before: exit=${before.exit}\n`);
      const after = await run([process.execPath, main, "check", "--base", "root()"]);
      process.stderr.write(`${name} ${policy} after: exit=${after.exit}\n`);
      expect([0, 1]).toContain(before.exit);
      expect([0, 1]).toContain(after.exit);
      expect(before.stderr).toContain("finding");
      expect(after.stderr).toContain("finding");
      const previous = rows(before.stdout);
      const current = rows(after.stdout);
      const added = current.filter((row) => !previous.some((old) => old.key === row.key));
      const removed = previous.filter((row) => !current.some((next) => next.key === row.key));
      const changed = current.filter((row) => {
        const old = previous.find((entry) => entry.key === row.key);
        return old !== undefined && JSON.stringify(old) !== JSON.stringify(row);
      });
      for (const [variant, result] of [
        ["before", before],
        ["after", after],
      ] as const) {
        await Bun.write(join(root, `${name}-${policy}-${variant}.jsonl`), result.stdout);
        await Bun.write(join(root, `${name}-${policy}-${variant}.stderr`), result.stderr);
      }
      comparisons.push({
        repo: name,
        source,
        copy: cwd,
        sourceHead: head.stdout.trim(),
        policy,
        cmd: "dx check --base 'root()'",
        before: { exit: before.exit, findings: previous.length, stderr: before.stderr },
        after: { exit: after.exit, findings: current.length, stderr: after.stderr },
        exactStdoutEqual: before.stdout === after.stdout,
        added,
        removed,
        changed,
        newFormatFindings: added.filter((row) => row.check === "format"),
      });
      if (policy === "original") expect(after.stdout === before.stdout).toBe(true);
      expect(added.every((row) => row.check === "format")).toBe(true);
    }
    const receipt = {
      measuredAt: Temporal.Now.instant().toString(),
      baseline,
      counts:
        "JSONL finding rows (deduplicated finding keys); additions/removals matched by key; changed means same key with different row",
      versionChoice: "private alpha remains 0.1.0; no tool release or changeset",
      comparisons,
    };
    await Bun.write(join(root, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    const output = process.env.DX_STRICT_INPUT_RECEIPT;
    if (output !== undefined) await Bun.write(output, JSON.stringify(receipt, null, 2) + "\n");
    process.stderr.write(`${JSON.stringify(receipt)}\n`);
  },
  1200000,
);
