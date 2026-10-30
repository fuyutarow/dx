import { expect, test } from "bun:test";
import { dx, jj, repo } from "./helpers.ts";

test("divergent jj operation heads are merged before reading, not reported as undetermined", async () => {
  const { cwd, base } = await repo();
  const before = await jj(
    cwd,
    "--ignore-working-copy",
    "op",
    "log",
    "-n1",
    "--no-graph",
    "-T",
    "id",
  );
  // Two writers that started from the same operation leave two operation heads.
  await jj(cwd, "--ignore-working-copy", "describe", "-m", "one");
  await jj(cwd, "--ignore-working-copy", `--at-operation=${before}`, "describe", "-m", "two");
  const result = await dx(cwd, "check", "--base", base, "@-");
  expect(result.stderr).not.toContain("more than one operation");
  expect(result.exit, result.stderr).toBe(0);
});
