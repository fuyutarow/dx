import { expect, test } from "bun:test";
import { dx, repo, write, snapshot } from "./helpers.ts";

const missingCommand =
  'UNDETERMINED:policy: semlint.toml: [review] command を書く（例: ["agx", "worker", "jev"]）';

test("rubric types require an explicit review command for check and review", async () => {
  const { cwd, base } = await repo({ review: "file:verdicts/*.jsonl" }, "[review]\n");
  await snapshot(cwd);

  for (const args of [["check", "--base", base], ["review"]]) {
    const result = await dx(cwd, ...args);
    expect(result.exit, result.stderr).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(missingCommand);
  }
});

test("repositories with legacy dx layout are rejected", async () => {
  const { cwd } = await repo();
  await write(cwd, "dx.toml", '[repo]\nname = "fixture"\n');
  await write(cwd, ".dx/note.ts", "export default {};\n");

  const result = await dx(cwd, "check");
  expect(result.exit, result.stderr).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe(
    "UNDETERMINED:dx.toml と .dx/ は読まない。semlint.toml（先頭に edition = 1）と .semlint/ に移す",
  );
});

test("repositories without rubric types may omit the review command", async () => {
  const { cwd, base } = await repo();
  const result = await dx(cwd, "check", "--base", base);
  expect(result.exit, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
});
