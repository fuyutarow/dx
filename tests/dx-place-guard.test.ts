import { expect, test } from "bun:test";
import { dx, markdown, repo, spawn, jj, snapshot, write } from "./helpers.ts";

test("review verdict globs that target policy files exit 4 in check and review", async () => {
  const { cwd, base } = await repo({ review: "file:.semlint/verdicts/*.jsonl" });
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  const git = await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  expect(git.exitCode).toBe(0);
  await jj(cwd, "git", "import");
  await write(cwd, "records/one.md", markdown("one"));

  for (const command of ["check", "review"]) {
    const result =
      command === "check" ? await dx(cwd, command, "--base", base) : await dx(cwd, command, base);
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "UNDETERMINED:policy: note: review.place は規則のファイル（semlint.toml、.semlint/、inputs）の外に置く",
    );
  }
}, 20000);

test("verdict globs outside policy files remain valid", async () => {
  const { cwd, base } = await repo({ review: "file:verdicts/*.jsonl" });
  await write(cwd, "records/one.md", markdown("one"));

  const checked = await dx(cwd, "check", "--base", base);
  expect(checked.exit).not.toBe(4);
}, 20000);

test("review verdict globs that target [files] inputs exit 4", async () => {
  const { cwd, base } = await repo(
    { review: "file:inputs/*.toml" },
    '[files]\ninputs = ["inputs/*.toml"]\n',
  );
  await write(cwd, "inputs/rule.toml", "value = true\n");
  await snapshot(cwd);

  const result = await dx(cwd, "check", "--base", base);
  expect(result.exit).toBe(4);
  expect(result.stderr).toContain("UNDETERMINED:policy: note: review.place は規則のファイル");
}, 20000);
