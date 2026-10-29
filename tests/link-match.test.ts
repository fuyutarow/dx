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
    ".semlint/note.ts",
    typeSource().replace('next: { to: "note" }', `next: ${declaration}`),
  );
  const base = await advance(cwd);
  return { cwd, base };
}

test(
  "values extracts internal ids from object resources and preserves original fields",
  async () => {
    const { cwd, base } = await linkedRepo(`{
      to: "note",
      values: field => z.array(z.object({ resource: z.string() })).safeParse(field).data?.flatMap(s => {
        const id = /^urn:uuid:(.+)$/u.exec(s.resource)?.[1];
        return id === undefined ? [] : [id];
      }) ?? []
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
    const a = rows(listed.stdout).find((record) => record.id === "a");
    expect(a?.links).toEqual([{ rel: "next", to: "b" }]);
    expect(a?.fields).toMatchObject({
      next: [{ resource: "https://example.test" }, { resource: "urn:uuid:b" }],
    });
  },
  timeout,
);

test(
  "values is not called for an absent field",
  async () => {
    const { cwd, base } = await linkedRepo('{ to: "note", values: value => value.ids }');
    await write(cwd, "records/a.md", markdown("a"));
    await checked(cwd, base, 0);
  },
  timeout,
);

for (const values of ['() => { throw Error("extract failed"); }', '() => "b"', "() => [42]"]) {
  test(
    `values rejects failures and non-string results: ${values}`,
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
  "plain ids and frozen dx: references keep their existing resolution",
  async () => {
    const { cwd } = await linkedRepo('{ to: "note" }');
    await write(
      cwd,
      "records/a.md",
      markdown(
        "a",
        'next: [b, "dx:other/absent", "dx:fixture/b", "dx:fixture/absent", "dx:other/"]\n',
      ),
    );
    await write(cwd, "records/b.md", markdown("b"));
    await snapshot(cwd);
    const result = await dx(cwd, "ls");
    expect(result.exit, result.stderr).toBe(0);
    const listed = rows(result.stdout);
    expect(listed.find((record) => record.id === "a")?.links).toEqual([
      { rel: "next", to: "b" },
      { rel: "next", to: "b" },
      { rel: "next", to: "absent" },
      { rel: "next", to: "dx:other/" },
    ]);
  },
  timeout,
);

test(
  "new dx: references produce a links.scheme finding",
  async () => {
    const { cwd, base } = await linkedRepo('{ to: "note" }');
    await write(cwd, "records/a.md", markdown("a", 'next: [b, "dx:fixture/b"]\n'));
    await write(cwd, "records/b.md", markdown("b"));
    await snapshot(cwd);
    const result = await dx(cwd, "check", "--base", base);
    expect(result.exit, result.stderr).toBe(1);
    const findings = rows(result.stdout);
    expect(
      findings.map((finding) => [finding.check, finding.field, finding.message]),
    ).toContainEqual(["links.scheme", "next", "dx: は使わない。ref:<repo>/<id> と書く"]);
  },
  timeout,
);

test(
  "acyclic false keeps reciprocal links while validating targets",
  async () => {
    const { cwd, base } = await linkedRepo('{ to: "note", acyclic: false }');
    await write(cwd, "records/a.md", markdown("a", "next: b\n"));
    await write(cwd, "records/b.md", markdown("b", "next: a\n"));
    await checked(cwd, base, 0);
    const listed = await dx(cwd, "ls");
    expect(listed.exit, listed.stderr).toBe(0);
    expect(rows(listed.stdout).find((record) => record.id === "a")?.links).toEqual([
      { rel: "next", to: "b" },
    ]);
  },
  timeout,
);
