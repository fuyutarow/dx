import { expect, test } from "bun:test";
import { parseRecords } from "../src/formats.ts";
import { checked, markdown, repo, value, write } from "./helpers.ts";

test("LF frontmatter delimiters remain readable", () => {
  const records = value(parseRecords("a.md", markdown("a"), "markdown-frontmatter"));
  expect(records).toHaveLength(1);
  expect(records[0]?.fields.id).toBe("a");
});

test.each([
  ["CRLF delimiters", '---\r\nid: "a"\r\ntitle: Title\r\n---\r\nBody\n'],
  ["CR in frontmatter", '---\nid: "a"\r\ntitle: Title\n---\nBody\n'],
])("%s produces a format finding", async (_name, text) => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", text);
  const result = await checked(cwd, base, 1);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({
    check: "format",
    path: "records/a.md",
    field: "records/a.md",
    message: "CR in frontmatter",
  });
});

test("CR in the Markdown body is not a format finding", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", markdown("a", "", "Body\r text\n"));
  const result = await checked(cwd, base, 0);
  expect(result.findings).toEqual([]);
});
