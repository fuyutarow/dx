import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { advance, dx, markdown, repo, rows, snapshot, typeSource, write } from "./helpers.ts";

async function legacyHistory() {
  const { cwd, base: grandparent } = await repo();
  await rm(`${cwd}/semlint.toml`);
  await rm(`${cwd}/.semlint`, { recursive: true });
  await write(cwd, "dx.toml", "legacy config is not parsed");
  await write(cwd, ".dx/note.ts", "legacy definition is not loaded");
  await write(cwd, "records/a.md", markdown("a"));
  const parent = await advance(cwd);
  await rm(`${cwd}/dx.toml`);
  await rm(`${cwd}/.dx`, { recursive: true });
  await write(
    cwd,
    "semlint.toml",
    'edition = 1\n[repo]\nname = "fixture"\n[files]\nstrict = true\n',
  );
  await write(cwd, ".semlint/note.ts", typeSource());
  return { cwd, grandparent, parent };
}

test("legacy layout migration is a policy-only change", async () => {
  const { cwd, parent } = await legacyHistory();
  const child = await snapshot(cwd);
  const result = await dx(cwd, "check", "--base", parent, child);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)).toEqual([]);
  expect(result.stderr).toContain("新しい finding 0 件");
}, 60000);

test("legacy migration with a record edit reports I-09", async () => {
  const { cwd, parent } = await legacyHistory();
  await write(cwd, "records/a.md", markdown("a", "", "Changed\n"));
  const child = await snapshot(cwd);
  const result = await dx(cwd, "check", "--base", parent, child);
  expect(result.exit, result.stderr).toBe(1);
  expect(
    rows(result.stdout).some((row) => row.check === "I-09.policy" && row.path === "records/a.md"),
  ).toBe(true);
}, 60000);

test("legacy layout remains rejected as policy revision", async () => {
  const { cwd, grandparent, parent } = await legacyHistory();
  const result = await dx(cwd, "check", "--base", grandparent, parent);
  expect(result.exit).toBe(4);
  expect(result.stderr).toContain(
    "dx.toml と .dx/ は読まない。semlint.toml（先頭に edition = 1）と .semlint/ に移す",
  );
}, 60000);
