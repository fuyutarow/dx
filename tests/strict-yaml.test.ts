import { expect, test } from "bun:test";
import { parseRecords } from "../src/formats.ts";
import { advance, checked, markdown, repo, value, write } from "./helpers.ts";

const rejected = [
  ["duplicate root", 'id: "other"\n', "unique"],
  ["duplicate nested", "data:\n  a: 1\n  a: 2\n", "unique"],
  ["duplicate flow", 'data: {"a":1,"a":2}\n', "unique"],
  ["duplicate sequence map", "data:\n  - a: 1\n    a: 2\n", "unique"],
  ["equivalent quoted key", 'data: {a: 1, "a": 2}\n', "unique"],
  ["anchor", "data: &value 1\n", "anchors"],
  ["collection anchor", "data: &value {a: 1}\n", "anchors"],
  ["key anchor", "data: {&key a: 1}\n", "anchors"],
  ["alias", "data: *missing\n", "aliases"],
  ["recursive alias", "data: &self [*self]\n", "anchors"],
  ["merge", "data: {<<: {a: 1}}\n", "merge"],
  ["tag", 'data: !!str "x"\n', "tags"],
  ["unknown tag", "data: !local x\n", "tags"],
  ["collection tag", "data: !!map {a: 1}\n", "tags"],
  ["non-specific tag", "data: ! x\n", "tags"],
  ["verbatim tag", "data: !<tag:yaml.org,2002:str> x\n", "tags"],
  ["explicit scalar key", "? a\n: x\n", "explicit keys"],
  ["nested explicit scalar key", "data:\n  ? scalar\n  : value\n", "explicit keys"],
  ["flow explicit scalar key", "data: {? a: x}\n", "explicit keys"],
  ["flow sequence explicit key", "data: [? a: x]\n", "explicit keys"],
  ["complex key", "data:\n  ? [a, b]\n  : value\n", "keys must be strings"],
  ["mapping key", "data: {? {a: b}: value}\n", "keys must be strings"],
  ["numeric key", "data: {1: x}\n", "keys must be strings"],
  ["boolean key", "data: {true: x}\n", "keys must be strings"],
  ["null key", "data: {null: x}\n", "keys must be strings"],
  ["empty key", "data:\n  : x\n", "keys must be strings"],
  ["raw NEL", 'data: "a\u0085b"\n', "U+0085"],
  ["raw BOM", 'data: "a\uFEFFb"\n', "U+FEFF"],
  ["escaped NEL", 'data: "a\\Nb"\n', "U+0085"],
  ["escaped BOM", 'data: ["a\\uFEFFb"]\n', "U+FEFF"],
  ["block BOM", "data: |\n  a\uFEFFb\n", "U+FEFF"],
] as const;

for (const [name, extra, reason] of rejected) {
  test(`strict YAML rejects ${name}`, () => {
    const result = parseRecords("a.md", markdown("a", extra), "markdown-frontmatter");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toContain(reason);
  });
}

for (const extra of [
  "data: {a: 1, b: [true, null, 2]}\n",
  "data:\n  - a: 1\n  - a: 2\n",
  'data: {"1": x, "true": y, "null": z}\n',
  'data: ["&anchor", "*alias", "!tag", "? complex", "a: b", "<<"]\n',
  "data: |\n  &anchor *alias !tag ? complex <<\n",
  "# &anchor *alias !tag\ndata: https://example.test/a!b&c*d\n",
  "data: café 日本語\n",
  '?question: value\ndata: {"? a": x, ?plain: y}\n',
  "# ? a\ndata: |\n  ? a\n  : x\n",
]) {
  test(`strict YAML preserves ordinary values: ${JSON.stringify(extra)}`, () => {
    const text = markdown("a", extra);
    const records = value(parseRecords("a.md", text, "markdown-frontmatter"));
    expect(Bun.YAML.parse(text.split("---\n")[1] ?? "")).toEqual(records[0]?.fields);
  });
}

test("YAML rejection is a format finding with a stable path key; unchanged violations remain", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", markdown("a", "data: {a: 1, a: 2}\n"));
  const initial = await checked(cwd, base, 1);
  expect(initial.findings).toHaveLength(1);
  expect(initial.findings[0]?.check).toBe("format");
  expect(initial.findings[0]?.field).toBe("records/a.md");
  const next = await advance(cwd);
  await write(cwd, "records/b.md", markdown("b"));
  const unchanged = await checked(cwd, next, 0);
  expect(unchanged.findings[0]?.key).toBe(initial.findings[0]?.key);
  expect(unchanged.findings[0]?.new).toBe(false);
});

test("soks explicit scalar key counterexample produces a format finding", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/probe.md", "---\n? a\n: x\n---\nbody");
  const result = await checked(cwd, base, 1);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({
    check: "format",
    path: "records/probe.md",
    message: "YAML explicit keys are unsupported",
  });
});

test("editing rejected YAML must satisfy I-02 even if its format key already exists", async () => {
  const { cwd } = await repo();
  await write(cwd, "records/a.md", markdown("a", "data: {a: 1, a: 2}\n"));
  const base = await advance(cwd);
  await write(cwd, "records/a.md", markdown("a", "data: {a: 1, a: 3}\n"));
  const changed = await checked(cwd, base, 1);
  expect(changed.findings[0]?.check).toBe("format");
  expect(changed.findings[0]?.new).toBe(true);
});
