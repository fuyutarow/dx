import { expect, test } from "bun:test";
import { advance, dx, repo, typeSource, write } from "./helpers.ts";

test("a removed links.match declaration fails while loading policy, even without records", async () => {
  const { cwd } = await repo();
  await write(
    cwd,
    ".dx/note.ts",
    typeSource().replace('next: { to: "note" }', 'next: { to: "note", match: "^urn:uuid:(.+)$" }'),
  );
  const base = await advance(cwd);
  const result = await dx(cwd, "check", "--base", base);

  expect(result.exit).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe(
    "UNDETERMINED:policy: note.links.next: match は消えた。values を使う",
  );
});
