import { expect, test } from "bun:test";
import { check } from "../src/commands/check.ts";
import { context, structural } from "../src/checks.ts";
import type { Snapshot } from "../src/collection.ts";
import { typeSchema, type TreeContext } from "../src/model.ts";
import { validate } from "../src/errors.ts";
import {
  advance,
  checked,
  dx,
  markdown,
  repo,
  rows,
  snapshot,
  typeSource,
  value,
  write,
} from "./helpers.ts";

const empty: Snapshot = {
  fileIds: new Map(),
  records: [],
  sources: new Map(),
  files: {},
  findings: [],
};
const loaded = (definition: unknown) => value(validate(typeSchema, definition));

test("tree checks run once per definition on each side, including empty trees, and share the index", async () => {
  const seen: TreeContext[] = [];
  const type = loaded({
    name: "note",
    match: "records/*.md",
    format: "markdown-frontmatter",
    id: () => "a",
    schema: (await import("zod")).z.unknown(),
    treeChecks: [
      (tree: TreeContext) => {
        seen.push(tree);
        return [];
      },
      (tree: TreeContext) => {
        expect(seen.at(-1)).toBe(tree);
        return Promise.resolve([]);
      },
    ],
  });
  value(await check(empty, empty, [type], []));
  expect(seen).toHaveLength(2);
  expect(seen[0]).not.toBe(seen[1]);
  expect(seen[0]?.index.byId.size).toBe(0);
});

test("index preserves duplicate ids and groups by type in record order", async () => {
  const record = {
    v: 1,
    id: "a",
    type: "note",
    path: "a.md",
    sha256: "",
    links: [],
    fields: {},
  } as const;
  const other = { ...record, type: "other", path: "b.md" };
  const indexed = context({ ...empty, records: [record, other] }, empty);
  expect(indexed.index.byId.get("a")).toEqual([record, other]);
  expect(indexed.index.byType.get("note")).toEqual([record]);
  expect(indexed.index.byType.get("other")).toEqual([other]);
  const observed: TreeContext[] = [];
  const type = loaded({
    name: "note",
    match: "*.md",
    format: "toml",
    id: () => "a",
    schema: (await import("zod")).z.unknown(),
    checks: [
      (_record: unknown, tree: TreeContext) => {
        observed.push(tree);
        return [];
      },
    ],
    treeChecks: [
      (tree: TreeContext) => {
        expect(observed[0]?.index).toBe(tree.index);
        return [];
      },
    ],
  });
  value(await structural({ ...empty, records: [record, other] }, empty, [type]));
  expect(observed).toHaveLength(1);
});

test("tree findings keep I-02 keys and changed-record classification alongside legacy checks", async () => {
  const { cwd } = await repo();
  await write(
    cwd,
    ".dx/note.ts",
    typeSource().replace(
      "views:",
      `treeChecks: [tree => tree.index.byType.get("note").filter(r => r.fields.bad).map(r => ({
    check: "tree.quality", id: r.id, path: r.path, field: "bad", message: "bad" }))], views:`,
    ),
  );
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  const base = await advance(cwd);
  const unchanged = await checked(cwd, base, 0);
  expect(unchanged.findings).toHaveLength(0);
  expect(unchanged.stderr).toContain("既存 2 件");
  const audit = await dx(cwd, "check", "--all", "--base", base);
  expect(audit.exit).toBe(0);
  await write(cwd, "records/a.md", markdown("a", "bad: true\n", "Changed\n"));
  const changed = await checked(cwd, base, 1);
  expect(changed.findings.map((f) => f.key)).toEqual(rows(audit.stdout).map((f) => f.key));
  expect(changed.findings.every((f) => f.new === true)).toBe(true);
}, 60000);

test("tree callbacks fail closed for throws and invalid results", async () => {
  const { cwd, base } = await repo();
  for (const callback of ['() => { throw Error("tree failure"); }', "async () => 42", "42"]) {
    await write(
      cwd,
      ".dx/note.ts",
      typeSource().replace("views:", `treeChecks: [${callback}], views:`),
    );
    await snapshot(cwd);
    const result = await dx(cwd, "check", "--base", base);
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
  }
  const invalid = typeSchema.safeParse({ treeChecks: [42] });
  expect(invalid.success).toBe(false);
});

test("inputs override ignores and type matches, stay readable, and are exempt from strict", async () => {
  const { cwd } = await repo(
    {},
    '[files]\nstrict=true\nignore=[".leakcheck", "records/input.md"]\ninputs=[".leakcheck", "records/input.md"]\n',
  );
  await write(cwd, ".leakcheck", "deny");
  await write(cwd, "records/input.md", "not a record");
  await write(
    cwd,
    ".dx/note.ts",
    typeSource().replace(
      "views:",
      `treeChecks: [tree => {
    if (tree.read(".leakcheck") !== "deny" || tree.files["records/input.md"] !== "not a record" || tree.records.length !== 0)
      throw Error("input visibility"); return []; }], views:`,
    ),
  );
  const base = await snapshot(cwd);
  await checked(cwd, base, 0);
  expect((await dx(cwd, "ls")).stdout).toBe("");
});

test("I-09: input edits, deletion, and declaration changes cannot accompany records; separate changes can", async () => {
  for (const mode of ["edit", "delete", "undeclare", "declare"] as const) {
    const { cwd } = await repo({}, mode === "declare" ? "" : '[files]\ninputs=[".leakcheck"]\n');
    await write(cwd, ".leakcheck", "before");
    const base = await advance(cwd);
    if (mode === "edit") await write(cwd, ".leakcheck", "after");
    if (mode === "delete") await (await import("node:fs/promises")).rm(`${cwd}/.leakcheck`);
    if (mode === "undeclare") await write(cwd, "dx.toml", '[repo]\nname="fixture"\n');
    if (mode === "declare")
      await write(cwd, "dx.toml", '[repo]\nname="fixture"\n[files]\ninputs=[".leakcheck"]\n');
    await write(cwd, "records/a.md", markdown("a"));
    expect((await checked(cwd, base, 1)).findings.some((f) => f.check === "I-09.policy")).toBe(
      true,
    );
  }
  const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
  const base = await advance(cwd);
  await write(cwd, ".leakcheck", "new rule");
  await advance(cwd);
  await write(cwd, "records/a.md", markdown("a"));
  await checked(cwd, base, 0);
}, 60000);

// A definition with no matching records still owns corpus-wide constraints.
test("tree-only findings do not acquire an implicit record id", async () => {
  const type = loaded({
    name: "note",
    match: "*.md",
    format: "toml",
    id: () => "a",
    schema: (await import("zod")).z.unknown(),
    treeChecks: [() => [{ check: "layout", path: "missing", message: "absent" }]],
  });
  expect(value(await structural(empty, empty, [type]))).toEqual([
    { check: "layout", path: "missing", message: "absent" },
  ]);
});
