import { expect, test } from "bun:test";
import { cp, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, processRun, rows } from "./helpers.ts";

async function saveReceipt(root: string, receipt: unknown) {
  const text = JSON.stringify(receipt, null, 2) + "\n";
  await Bun.write(join(root, "receipt.json"), text);
  const output = process.env.DX_DEVX_RECEIPT;
  if (output !== undefined) await Bun.write(output, text);
}

// Independent, retained copies: never run a writing jj command in the sources.
test.skipIf(process.env.DX_DEVX_SHADOW !== "1")(
  "DevX batch preserves corpus decisions",
  async () => {
    const baseline = process.env.DX_DEVX_BASELINE;
    expect(baseline).toBeDefined();
    const root = await mkdtemp(join(tmpdir(), "dx-devx-shadow-"));
    const comparisons = [];
    for (const name of ["retrospectives", "soks"]) {
      const source = `/tmp/dx-yaml-shadow/${name}`;
      const cwd = join(root, name);
      await cp(source, cwd, { recursive: true });
      const head = await processRun(cwd, [
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
      for (const base of ["@", "root()", "default"]) {
        const args = base === "default" ? [] : ["--base", base];
        const before = await processRun(
          cwd,
          [process.execPath, join(baseline ?? "", "src/main.ts"), "check", ...args],
          300000,
        );
        const after = await processRun(cwd, [process.execPath, main, "check", ...args], 300000);
        const all = await processRun(
          cwd,
          [process.execPath, main, "check", "--all", ...args],
          300000,
        );
        const previous = rows(before.stdout).filter((row) => row.new === true);
        const current = rows(after.stdout);
        const expectedNew =
          before.stdout
            .split("\n")
            .filter((line) => line !== "" && rows(line)[0]?.new === true)
            .join("\n") + (previous.length > 0 ? "\n" : "");
        const added = current.filter(
          (row) => !previous.some((old) => JSON.stringify(old) === JSON.stringify(row)),
        );
        const removed = previous.filter(
          (row) => !current.some((next) => JSON.stringify(next) === JSON.stringify(row)),
        );
        const comparison = {
          name,
          source,
          copy: cwd,
          head: head.stdout.trim(),
          base,
          before: { exit: before.exit, newFindings: previous.length, stderr: before.stderr },
          after: { exit: after.exit, newFindings: current.length, stderr: after.stderr },
          all: { exit: all.exit, findings: rows(all.stdout).length, stderr: all.stderr },
          allStdoutEqual: all.stdout === before.stdout,
          newStdoutEqual: after.stdout === expectedNew,
          added,
          removed,
        };
        comparisons.push(comparison);
        await Promise.all(
          (
            [
              ["before", before],
              ["after", after],
              ["all", all],
            ] as const
          ).map(([variant, result]) =>
            Bun.write(
              join(root, `${name}-${base === "root()" ? "root" : base}-${variant}.jsonl`),
              result.stdout,
            ),
          ),
        );
        const receipt = {
          measuredAt: Temporal.Now.instant().toString(),
          baseline,
          counts: "deduplicated finding rows; compare complete new:true rows as a set",
          versionChoice: "private alpha remains 0.1.0; no release or changeset",
          comparisons,
        };
        await saveReceipt(root, receipt);
        process.stderr.write(`${JSON.stringify(comparison)}\n`);
        expect(after.exit).toBe(before.exit);
        expect(all.exit).toBe(before.exit);
        expect(all.stdout).toBe(before.stdout);
        expect(after.stdout).toBe(expectedNew);
        expect(added).toEqual([]);
        expect(removed).toEqual([]);
        expect([0, 1]).toContain(after.exit);
      }
    }
    process.stderr.write(`Shadow copies: ${root}\n`);
  },
  1200000,
);
