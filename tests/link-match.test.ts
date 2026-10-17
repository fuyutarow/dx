import { expect, test } from "bun:test";
import {
  advance,
  checked,
  dx,
  markdown,
  repo,
  rows,
  snapshot,
  typeSource,
  write,
} from "./helpers.ts";

const timeout = 30000;
async function linkedRepo(declaration: string, config = "") {
  const { cwd } = await repo({}, config);
  await write(
    cwd,
    ".dx/note.ts",
    typeSource().replace('next: { to: "note" }', `next: ${declaration}`),
  );
  const base = await advance(cwd);
  return { cwd, base };
}
const urnLink = '{ to: "note", match: "^urn:uuid:(.+)$" }';

test(
  "match filters mixed candidates and extracts ids for existence, ambiguity and cycles",
  async () => {
    const { cwd, base } = await linkedRepo(urnLink);
    await write(
      cwd,
      "records/a.md",
      markdown(
        "a",
        'next: ["https://example.test", "A citation", "urn:uuid:b", "urn:uuid:absent"]\n',
      ),
    );
    await write(cwd, "records/b.md", markdown("b", 'next: "urn:uuid:a"\n'));
    await write(cwd, "records/duplicate1.md", markdown("duplicate"));
    await write(cwd, "records/duplicate2.md", markdown("duplicate"));
    await write(cwd, "records/c.md", markdown("c", 'next: "urn:uuid:duplicate"\n'));
    const result = await checked(cwd, base, 1);
    expect(
      result.findings
        .filter((f) => f.check === "I-04.target")
        .map((f) => String(f.field))
        .toSorted(),
    ).toEqual(["next:absent", "next:duplicate"]);
    expect(result.findings.filter((f) => f.check === "I-04.cycle")).toHaveLength(1);
    const listed = await dx(cwd, "ls");
    expect(listed.exit, listed.stderr).toBe(0);
    expect(rows(listed.stdout).find((r) => r.id === "a")?.links).toEqual([
      { rel: "next", to: "b" },
      { rel: "next", to: "absent" },
    ]);
  },
  timeout,
);

test(
  "values extracts object resources before match and preserves original fields",
  async () => {
    const { cwd, base } = await linkedRepo(`{
    to: "note", match: "^urn:uuid:(.+)$",
    values: field => z.array(z.object({ resource: z.string() })).safeParse(field).data?.map(s => s.resource) ?? []
  }`);
    await write(
      cwd,
      "records/a.md",
      markdown("a", 'next: [{resource: "https://example.test"}, {resource: "urn:uuid:b"}]\n'),
    );
    await write(cwd, "records/b.md", markdown("b"));
    await checked(cwd, base, 0);
    const listed = await dx(cwd, "ls");
    expect(listed.exit, listed.stderr).toBe(0);
    const a = rows(listed.stdout).find((r) => r.id === "a");
    expect(a?.links).toEqual([{ rel: "next", to: "b" }]);
    expect(a?.fields).toMatchObject({
      next: [{ resource: "https://example.test" }, { resource: "urn:uuid:b" }],
    });
  },
  timeout,
);

test(
  "values works without match and is not called for an absent field",
  async () => {
    const { cwd, base } = await linkedRepo('{ to: "note", values: value => value.ids }');
    await write(cwd, "records/a.md", markdown("a", "next: {ids: [b]}\n"));
    await write(cwd, "records/b.md", markdown("b"));
    await checked(cwd, base, 0);
  },
  timeout,
);

for (const expression of [
  "[",
  "^urn:uuid:.+$",
  "(?:id)",
  "(?=id)",
  "[(]id[)]",
  String.raw`\(id\)`,
]) {
  test(
    `invalid or capture-free match fails closed even with no records: ${expression}`,
    async () => {
      const { cwd, base } = await linkedRepo(
        `{ to: "note", match: ${JSON.stringify(expression)} }`,
      );
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit).toBe(4);
      expect(result.stderr).toContain("links");
      expect(result.stderr).toContain(
        expression === "[" ? "invalid links.match" : "capture group 1",
      );
    },
    timeout,
  );
}

for (const [expression, candidate] of [
  ["^(?<id>b)$", "b"],
  ["^(?=(b))b$", "b"],
  ["^(b)\\1$", "bb"],
  ["^(?:prefix:)(b)$", "prefix:b"],
] as const) {
  test(
    `real captures are recognized: ${expression}`,
    async () => {
      const { cwd, base } = await linkedRepo(
        `{ to: "note", match: ${JSON.stringify(expression)} }`,
      );
      await write(cwd, "records/a.md", markdown("a", `next: ${candidate}\n`));
      await write(cwd, "records/b.md", markdown("b"));
      await checked(cwd, base, 0);
      const listed = await dx(cwd, "ls");
      expect(listed.exit).toBe(0);
      expect(rows(listed.stdout).find((r) => r.id === "a")?.links).toEqual([
        { rel: "next", to: "b" },
      ]);
    },
    timeout,
  );
}

for (const [expression, candidate] of [
  ["^(a)?b$", "b"],
  ["^(.*)$", ""],
] as const) {
  test(
    `a matched value must provide nonempty capture 1: ${expression}`,
    async () => {
      const { cwd, base } = await linkedRepo(
        `{ to: "note", match: ${JSON.stringify(expression)}, values: () => [${JSON.stringify(candidate)}] }`,
      );
      await write(cwd, "records/a.md", markdown("a", "next: anything\n"));
      const result = await checked(cwd, base, 4);
      expect(result.stderr).toContain("capture group 1 must produce a non-empty id");
    },
    timeout,
  );
}

for (const values of [
  '() => { throw Error("extract failed"); }',
  '() => "b"',
  "() => [42]",
  "() => null",
  'async () => ["b"]',
]) {
  test(
    `values rejects failures and non-string-array results: ${values}`,
    async () => {
      const { cwd, base } = await linkedRepo(`{ to: "note", values: ${values} }`);
      await write(cwd, "records/a.md", markdown("a", "next: anything\n"));
      const result = await checked(cwd, base, 4);
      expect(result.stderr).toContain("records/a.md: links.next.values");
    },
    timeout,
  );
}

test(
  "omitting match preserves plain ids and wrong field shapes",
  async () => {
    const { cwd, base } = await repo();
    await write(
      cwd,
      "records/a.md",
      markdown("a", 'next: [b, "https://example.test", "urn:uuid:b"]\n'),
    );
    await write(cwd, "records/b.md", markdown("b"));
    await write(cwd, "records/c.md", markdown("c", "next: {resource: b}\n"));
    const result = await checked(cwd, base, 1);
    expect(
      result.findings
        .filter((f) => f.check === "I-04.target")
        .map((f) => String(f.field))
        .toSorted(),
    ).toEqual(["next:https://example.test", "next:urn:uuid:b"]);
    expect(result.findings.filter((f) => f.check === "I-04.links")).toHaveLength(1);
  },
  timeout,
);

test(
  "to accepts several declared types and rejects other types",
  async () => {
    const { cwd } = await linkedRepo('{ to: ["note", "other"], match: "^urn:uuid:(.+)$" }');
    for (const name of ["other", "third"]) {
      await write(
        cwd,
        `.dx/${name}.ts`,
        typeSource()
          .replaceAll('"note"', JSON.stringify(name))
          .replace('"records/*.md"', `"${name}/*.md"`)
          .replace("views: { index:", `views: { ${name}index:`),
      );
    }
    const base = await advance(cwd);
    await write(
      cwd,
      "records/a.md",
      markdown("a", 'next: ["urn:uuid:b", "urn:uuid:c", "urn:uuid:d"]\n'),
    );
    await write(cwd, "records/b.md", markdown("b"));
    await write(cwd, "other/c.md", markdown("c"));
    await write(cwd, "third/d.md", markdown("d"));
    const result = await checked(cwd, base, 1);
    expect(result.findings.map((f) => [f.check, f.field])).toEqual([["I-04.type", "next:d"]]);
  },
  timeout,
);

for (const to of ['["note", "missing"]', "[]"]) {
  test(
    `target type arrays must be nonempty and declared: ${to}`,
    async () => {
      const { cwd, base } = await linkedRepo(`{ to: ${to} }`);
      expect((await dx(cwd, "check", "--base", base)).exit).toBe(4);
    },
    timeout,
  );
}

test(
  "dx: foreign references are excluded after match; local ones are checked as internal ids",
  async () => {
    const { cwd, base } = await linkedRepo('{ to: "note", match: "^ref:(.+)$" }');
    await write(
      cwd,
      "records/a.md",
      markdown(
        "a",
        'next: ["ref:dx:other/absent", "ref:dx:fixture/b", "ref:dx:fixture/absent", "dx:fixture/ignored"]\n',
      ),
    );
    await write(cwd, "records/b.md", markdown("b", 'next: "ref:dx:fixture/a"\n'));
    const result = await checked(cwd, base, 1);
    expect(result.findings.filter((f) => f.check === "I-04.target").map((f) => f.field)).toEqual([
      "next:absent",
    ]);
    expect(result.findings.filter((f) => f.check === "I-04.cycle")).toHaveLength(1);
    const listed = await dx(cwd, "ls");
    expect(rows(listed.stdout).find((r) => r.id === "a")?.links).toEqual([
      { rel: "next", to: "b" },
      { rel: "next", to: "absent" },
    ]);
  },
  timeout,
);

test(
  "without match local dx: ids are resolved, malformed foreign references are not exempt",
  async () => {
    const { cwd, base } = await repo();
    await write(
      cwd,
      "records/a.md",
      markdown(
        "a",
        'next: ["dx:research-record-v1/abcdef", "dx:fixture/b", "dx:fixture/absent", "dx:other/"]\n',
      ),
    );
    await write(cwd, "records/b.md", markdown("b"));
    const result = await checked(cwd, base, 1);
    expect(result.findings.map((f) => [f.check, f.field])).toEqual([
      ["I-04.target", "next:absent"],
      ["I-04.target", "next:dx:other/"],
    ]);
  },
  timeout,
);

test(
  "matched missing targets obey I-02 and become new when the source is edited",
  async () => {
    const { cwd } = await linkedRepo(urnLink);
    await write(cwd, "records/a.md", markdown("a", 'next: "urn:uuid:absent"\n'));
    const base = await advance(cwd);
    const unchanged = await checked(cwd, base, 0);
    expect(unchanged.findings).toEqual([]);
    expect(unchanged.stderr).toContain("既存 1 件");
    await write(cwd, "records/a.md", markdown("a", 'next: "urn:uuid:absent"\n', "Edited\n"));
    const changed = await checked(cwd, base, 1);
    expect(changed.findings[0]?.new).toBe(true);
  },
  timeout,
);

test(
  "links_per_record counts extracted internal links after filtering",
  async () => {
    const { cwd, base } = await linkedRepo(urnLink, "[limits]\nlinks_per_record=1\n");
    await write(
      cwd,
      "records/a.md",
      markdown("a", 'next: ["URL", "citation", "urn:uuid:dx:foreign/id", "urn:uuid:b"]\n'),
    );
    await write(cwd, "records/b.md", markdown("b"));
    await checked(cwd, base, 0);
    await write(cwd, "records/a.md", markdown("a", 'next: ["urn:uuid:b", "urn:uuid:b"]\n'));
    await snapshot(cwd);
    const result = await dx(cwd, "check", "--base", base);
    expect(result.exit).toBe(4);
    expect(result.stderr).toContain("limits.links_per_record exceeded");
  },
  timeout,
);

for (const acyclic of [undefined, true, false]) {
  test(
    `acyclic defaults to true and explicitly false retains reciprocal links: ${String(acyclic)}`,
    async () => {
      const declaration =
        acyclic === undefined ? '{ to: "note" }' : `{ to: "note", acyclic: ${String(acyclic)} }`;
      const { cwd, base } = await linkedRepo(declaration);
      await write(cwd, "records/a.md", markdown("a", "next: b\n"));
      await write(cwd, "records/b.md", markdown("b", "next: a\n"));
      const result = await checked(cwd, base, acyclic === false ? 0 : 1);
      expect(result.findings.filter((f) => f.check === "I-04.cycle")).toHaveLength(
        acyclic === false ? 0 : 1,
      );
      const listed = await dx(cwd, "ls");
      expect(listed.exit, listed.stderr).toBe(0);
      expect(rows(listed.stdout).find((r) => r.id === "a")?.links).toEqual([
        { rel: "next", to: "b" },
      ]);
      expect(rows(listed.stdout).find((r) => r.id === "b")?.links).toEqual([
        { rel: "next", to: "a" },
      ]);
    },
    timeout,
  );
}

test(
  "acyclic false still checks extracted targets for existence, ambiguity and type",
  async () => {
    const { cwd } = await linkedRepo(`{
    to: ["note"], acyclic: false, match: "^ref:(.+)$",
    values: value => z.array(z.object({ resource: z.string() })).safeParse(value).data?.map(s => s.resource) ?? []
  }`);
    await write(
      cwd,
      ".dx/other.ts",
      typeSource()
        .replaceAll('"note"', '"other"')
        .replace('"records/*.md"', '"other/*.md"')
        .replace("views: { index:", "views: { otherindex:"),
    );
    const base = await advance(cwd);
    await write(
      cwd,
      "records/a.md",
      markdown(
        "a",
        'next: [{resource: "ref:a"}, {resource: "ref:dx:fixture/absent"}, {resource: "ref:wrong"}, {resource: "ref:duplicate"}, {resource: "https://example.test"}]\n',
      ),
    );
    await write(cwd, "other/wrong.md", markdown("wrong"));
    await write(cwd, "records/duplicate1.md", markdown("duplicate"));
    await write(cwd, "records/duplicate2.md", markdown("duplicate"));
    const result = await checked(cwd, base, 1);
    expect(result.findings.filter((f) => f.check === "I-04.cycle")).toEqual([]);
    expect(
      result.findings
        .filter((f) => f.check === "I-04.target")
        .map((f) => String(f.field))
        .toSorted(),
    ).toEqual(["next:absent", "next:duplicate"]);
    expect(result.findings.filter((f) => f.check === "I-04.type").map((f) => f.field)).toEqual([
      "next:wrong",
    ]);
  },
  timeout,
);

test(
  "cycles use only acyclic edges, including cycles across different relations",
  async () => {
    const { cwd } = await repo();
    await write(
      cwd,
      ".dx/note.ts",
      typeSource().replace(
        'links: { next: { to: "note" } }',
        'links: { next: { to: "note" }, supersedes: { to: "note", acyclic: true }, cites: { to: "note", acyclic: false } }',
      ),
    );
    const base = await advance(cwd);
    await write(cwd, "records/a.md", markdown("a", "next: b\n"));
    await write(cwd, "records/b.md", markdown("b", "cites: a\n"));
    await checked(cwd, base, 0);
    await write(cwd, "records/b.md", markdown("b", "cites: a\nsupersedes: a\n"));
    const result = await checked(cwd, base, 1);
    expect(result.findings.filter((f) => f.check === "I-04.cycle")).toHaveLength(1);
  },
  timeout,
);

for (const invalid of ['"false"', "null", "0"]) {
  test(
    `acyclic must be a boolean, even with no records: ${invalid}`,
    async () => {
      const { cwd, base } = await linkedRepo(`{ to: "note", acyclic: ${invalid} }`);
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit).toBe(4);
      expect(result.stderr).toContain("acyclic");
    },
    timeout,
  );
}
