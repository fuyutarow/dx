import { expect, test } from "bun:test";
import { advance, checked, markdown, repo, write } from "./helpers.ts";

test("I-09 treats a dx.toml change and a record change in one commit as a policy violation", async () => {
  const { cwd } = await repo();
  await write(cwd, "records/a.md", markdown("a"));
  const withRecord = await advance(cwd);
  await checked(cwd, withRecord, 0);
  await write(cwd, "dx.toml", '[repo]\nname = "changed"\n');
  await write(cwd, "records/a.md", markdown("a", "", "Changed\n"));
  const result = await checked(cwd, withRecord, 1);
  expect(result.findings).toMatchObject([
    { check: "I-09.policy", path: "records/a.md", new: true },
  ]);
}, 60000);
