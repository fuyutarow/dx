import {
  value,
  advance,
  checked,
  dx,
  jj,
  markdown,
  repo,
  rows,
  snapshot,
  typeSource,
  write,
} from "./helpers.ts";
import { test, expect } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sha256, parseRecords, recordSha256 } from "../src/formats.ts";
import { requireValue } from "../src/errors.ts";

const timeout = 60000;
const mutableTomlPair = (title: string, badTitle = "Old") =>
  `[[records]]\nid = "old"\ntitle = "${badTitle}"\nbad = true\n[[records]]\nid = "sibling"\ntitle = "${title}"\n`;

test(
  "positive receipt: valid immutable addition exits 0",
  async () => {
    const { cwd, base } = await repo({ immutable: true });
    await write(cwd, "records/a.md", markdown("a"));
    const result = await checked(cwd, base, 0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("新しい finding 0 件");
  },
  timeout,
);

test(
  "negative receipt / I-03: immutable edit exits 1 with new:true; unchanged passes",
  async () => {
    const { cwd } = await repo({ immutable: true });
    await write(cwd, "records/a.md", markdown("a"));
    const base = await advance(cwd);
    await checked(cwd, base, 0);
    await write(cwd, "records/a.md", markdown("a", "", "Changed\n"));
    const result = await checked(cwd, base, 1);
    expect(
      result.findings.some((finding) => finding.check === "I-03.immutable" && finding.new === true),
    ).toBe(true);
  },
  timeout,
);

test(
  "I-03: deletion and frontmatter-only verdict addition are immutable changes",
  async () => {
    const { cwd } = await repo({ immutable: true });
    await write(cwd, "records/a.md", markdown("a"));
    const base = await advance(cwd);
    await write(cwd, "records/a.md", markdown("a", "review: {}\n"));
    expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-03.immutable")).toBe(
      true,
    );
    await rm(join(cwd, "records/a.md"));
    expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-03.immutable")).toBe(
      true,
    );
  },
  timeout,
);

test(
  "I-02: existing and new findings are classified separately; existing alone passes",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/old.md", markdown("old", "bad: true\n"));
    const base = await advance(cwd);
    const existing = await checked(cwd, base, 0);
    expect(existing.findings).toHaveLength(0);
    expect(existing.stderr).toContain("既存 1 件");
    await write(cwd, "records/new.md", markdown("new", "bad: true\n"));
    const result = await checked(cwd, base, 1);
    expect(result.findings).toHaveLength(1);
    expect(result.stderr).toContain("既存 1 件");
    expect(result.findings.find((r) => r.id === "new")?.new).toBe(true);
  },
  timeout,
);

test(
  "I-02: changed records must clear existing findings; unchanged records retain them",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/edited.md", markdown("edited", "bad: true\n"));
    await write(cwd, "records/untouched.md", markdown("untouched", "bad: true\n"));
    const base = await advance(cwd);
    const before = await checked(cwd, "root()", 1);
    await write(cwd, "records/edited.md", markdown("edited", "bad: true\n", "Changed\n"));
    const rejected = await checked(cwd, base, 1);
    expect(rejected.findings).toHaveLength(1);
    expect(rejected.findings.find((row) => row.id === "edited")).toEqual({
      ...before.findings.find((row) => row.id === "edited"),
      new: true,
    });
    expect(rejected.stderr).toContain("既存 1 件");
    await write(cwd, "records/edited.md", markdown("edited", "", "Changed\n"));
    const repaired = await checked(cwd, base, 0);
    expect(repaired.findings).toHaveLength(0);
    expect(repaired.stderr).toContain("既存 1 件");
  },
  timeout,
);

test(
  "I-02: a sibling TOML edit does not change an untouched record's hash",
  async () => {
    const { cwd } = await repo({ format: "toml" });
    await write(cwd, "records/pair.toml", mutableTomlPair("Before"));
    const base = await advance(cwd);
    await write(cwd, "records/pair.toml", mutableTomlPair("After"));
    const unchanged = await checked(cwd, base, 0);
    expect(unchanged.findings).toHaveLength(0);
    expect(unchanged.stderr).toContain("既存 1 件");
    await write(cwd, "records/pair.toml", mutableTomlPair("After", "Edited"));
    const changed = await checked(cwd, base, 1);
    expect(changed.findings[0]?.check).toBe("quality");
    expect(changed.findings[0]?.new).toBe(true);
  },
  timeout,
);

test(
  "I-02: frontmatter review metadata alone does not change the record hash",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/old.md", markdown("old", "bad: true\n"));
    const base = await advance(cwd);
    await write(cwd, "records/old.md", markdown("old", "bad: true\nreview: {}\n"));
    const result = await checked(cwd, base, 0);
    expect(result.findings).toHaveLength(0);
    expect(result.stderr).toContain("既存 1 件");
  },
  timeout,
);

test(
  "I-02: head policy is applied to base and head",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
    await write(cwd, ".dx/note.ts", typeSource().replace("record.fields.bad === true", "false"));
    const base = await advance(cwd);
    await write(cwd, ".dx/note.ts", typeSource());
    const result = await checked(cwd, base, 0);
    expect(result.findings).toHaveLength(0);
    expect(result.stderr).toContain("既存 1 件");
  },
  timeout,
);

test(
  "I-04: valid links pass; missing targets, wrong shapes and cycles fail together",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a", "next: b\n"));
    await write(cwd, "records/b.md", markdown("b"));
    await checked(cwd, base, 0);
    await write(cwd, "records/b.md", markdown("b", "next: a\n"));
    await write(cwd, "records/c.md", markdown("c", "next: absent\n"));
    await write(cwd, "records/d.md", markdown("d", "next: 42\n"));
    const result = await checked(cwd, base, 1);
    expect(new Set(result.findings.map((r) => r.check))).toEqual(
      new Set(["I-04.cycle", "I-04.target", "I-04.links"]),
    );
  },
  timeout,
);

test(
  "I-04: link must point to declared type; external reserved references are not resolved",
  async () => {
    const { cwd } = await repo();
    await write(
      cwd,
      ".dx/other.ts",
      typeSource()
        .replaceAll('"note"', '"other"')
        .replace('"records/*.md"', '"other/*.md"')
        .replace("views: { index:", "views: { otherindex:"),
    );
    const base = await advance(cwd);
    await write(cwd, "records/a.md", markdown("a", "next: b\n"));
    await write(cwd, "other/b.md", markdown("b"));
    expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-04.type")).toBe(true);
    await write(cwd, "records/a.md", markdown("a", 'next: "dx:remote/id"\n'));
    await checked(cwd, base, 0);
  },
  timeout,
);

test(
  "I-05: unique stable ids pass; duplicates and reassignment fail with I-03 independently",
  async () => {
    const { cwd } = await repo({ immutable: true });
    await write(cwd, "records/a.md", markdown("a"));
    const base = await advance(cwd);
    await checked(cwd, base, 0);
    await write(cwd, "records/a.md", markdown("renamed"));
    await write(cwd, "records/b.md", markdown("renamed"));
    const result = await checked(cwd, base, 1);
    for (const check of ["I-03.immutable", "I-05.identity", "I-05.duplicate"])
      expect(result.findings.map((r) => r.check)).toContain(check);
  },
  timeout,
);

async function reviewed(place: string, immutable = false) {
  const fixture = await repo({ review: place, immutable });
  const text = markdown("a");
  const file = value(
    requireValue(value(parseRecords("records/a.md", text, "markdown-frontmatter"))[0], "fixture"),
  );
  const verdict = {
    v: 1,
    id: "a",
    sha256: recordSha256(file),
    rubric: "rubrics/r.toml",
    rubric_sha256: sha256('rubric = "r"\n'),
    by: "reviewer",
    at: "2026-10-17T00:00:00Z",
    bits: 1,
    p: [0.9],
    pass: true,
  };
  return { ...fixture, text, verdict };
}

test(
  "I-06 frontmatter: matching verdict passes; stale hashes, self-review, low p and fail reject",
  async () => {
    const { cwd, base, verdict } = await reviewed("frontmatter");
    const save = (v: unknown, body = "Body\n") =>
      write(cwd, "records/a.md", markdown("a", `review: ${JSON.stringify(v)}\n`, body));
    await save(verdict);
    await checked(cwd, base, 0);
    for (const v of [
      { ...verdict, by: "author" },
      { ...verdict, pass: false },
      { ...verdict, p: [0.1] },
      { ...verdict, rubric_sha256: "0".repeat(64) },
      { ...verdict, sha256: "0".repeat(64) },
      { ...verdict, id: "wrong" },
      { ...verdict, rubric: "wrong" },
    ]) {
      await save(v);
      expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-06.verdict")).toBe(
        true,
      );
    }
    await save(verdict, "Edited after review\n");
    await checked(cwd, base, 1);
  },
  timeout,
);

test(
  "I-06 file: new immutable record needs a verdict, matching JSONL passes, changed body fails",
  async () => {
    const { cwd, base, text, verdict } = await reviewed("file:verdicts/*.jsonl", true);
    await write(cwd, "records/a.md", text);
    await checked(cwd, base, 1);
    await write(cwd, "verdicts/a.jsonl", `${JSON.stringify(verdict)}\n`);
    await checked(cwd, base, 0);
    await write(cwd, "records/a.md", markdown("a", "", "changed\n"));
    await checked(cwd, base, 1);
  },
  timeout,
);

test(
  "I-06: rubric-only change does not invalidate an unchanged accepted record",
  async () => {
    const { cwd, verdict } = await reviewed("frontmatter");
    await write(cwd, "records/a.md", markdown("a", `review: ${JSON.stringify(verdict)}\n`));
    const base = await advance(cwd);
    await write(cwd, ".dx/rubrics/r.toml", 'rubric = "new"\n');
    await checked(cwd, base, 0);
  },
  timeout,
);

test(
  "I-09: policy-only and record-only pass; combined change rejects",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, ".dx/note.ts", `${typeSource()}\n// policy change\n`);
    await checked(cwd, base, 0);
    await write(cwd, "records/a.md", markdown("a"));
    expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-09.policy")).toBe(
      true,
    );
  },
  timeout,
);

test(
  "ls, view and view --list acceptance receipts; historical reads ignore disk rules",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    const revision = await snapshot(cwd);
    for (const args of [
      ["ls", revision],
      ["view", "index", revision],
      ["view", "--list"],
    ]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, result.stderr).toBe(0);
      expect(rows(result.stdout)[0]?.v).toBe(1);
      if (args[0] === "ls") expect(rows(result.stdout)[0]?.id).toBe("a");
      if (args[1] === "index")
        expect(rows(result.stdout)).toEqual([{ v: 1, id: "a", title: "Title" }]);
      if (args[1] === "--list")
        expect(rows(result.stdout)).toEqual([{ v: 1, name: "index", type: "note" }]);
    }
    await write(cwd, ".dx/note.ts", "invalid TypeScript");
    await snapshot(cwd);
    const historical = await dx(cwd, "ls", revision);
    expect(historical.exit, historical.stderr).toBe(0);
    expect(rows(historical.stdout)[0]?.id).toBe("a");
    const current = await dx(cwd, "ls");
    expect(current.exit).toBe(4);
    expect(current.stdout).toBe("");
  },
  timeout,
);

test(
  "toml adapter: a file can contain several records",
  async () => {
    const { cwd, base } = await repo({ format: "toml" });
    await write(
      cwd,
      "records/a.toml",
      '[[records]]\nid="a"\ntitle="A"\nnext="b"\n[[records]]\nid="b"\ntitle="B"\n',
    );
    await checked(cwd, base, 0);
    const result = await dx(cwd, "ls");
    expect(result.exit, result.stderr).toBe(0);
    expect(rows(result.stdout).map((r) => r.id)).toEqual(["a", "b"]);
  },
  timeout,
);

test(
  "check uses root when the configured remote branch is absent, even with a local bookmark",
  async () => {
    const { cwd } = await repo();
    const result = await dx(cwd, "check");
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("base: remote branch absent; using root()\n");
    await jj(cwd, "bookmark", "create", "alpha", "-r", "@-");
    const resultLocal = await dx(cwd, "check");
    expect(resultLocal.exit).toBe(0);
    expect(resultLocal.stderr).toBe(result.stderr); // A local bookmark cannot replace the remote authority.
  },
  timeout,
);

test(
  "I-05: an additional duplicate is new even if that id is already duplicated in base",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/a.md", markdown("same"));
    await write(cwd, "records/b.md", markdown("same"));
    const base = await advance(cwd);
    await write(cwd, "records/c.md", markdown("same"));
    const result = await checked(cwd, base, 1);
    const duplicates = result.findings.filter((r) => r.check === "I-05.duplicate");
    expect(duplicates.filter((r) => r.new === false)).toHaveLength(0);
    expect(result.stderr).toContain("既存 1 件");
    expect(duplicates.filter((r) => r.new === true)).toHaveLength(1);
  },
  timeout,
);

test(
  "I-09: separate policy and record changes in an audit range are allowed",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, ".dx/note.ts", `${typeSource()}\n// policy-only change\n`);
    await advance(cwd);
    await write(cwd, "records/a.md", markdown("a"));
    await checked(cwd, base, 0);
  },
  timeout,
);

test(
  "I-09: narrowing the head match cannot hide a simultaneous record edit",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    const base = await advance(cwd);
    await write(cwd, ".dx/note.ts", typeSource().replace('"records/*.md"', '"new/*.md"'));
    await write(cwd, "records/a.md", markdown("a", "", "changed\n"));
    expect((await checked(cwd, base, 1)).findings.some((row) => row.check === "I-09.policy")).toBe(
      true,
    );
  },
  timeout,
);

test(
  "immutable TOML containers permit adding another independent record",
  async () => {
    const { cwd } = await repo({ immutable: true, format: "toml" });
    const first = '[[records]]\nid="a"\ntitle="A"\n';
    await write(cwd, "records/container.toml", first);
    const base = await advance(cwd);
    await write(cwd, "records/container.toml", `${first}[[records]]\nid="b"\ntitle="B"\n`);
    await checked(cwd, base, 0);
    await write(
      cwd,
      "records/container.toml",
      `${first.replace('title="A"', 'title="Changed"')}[[records]]\nid="b"\ntitle="B"\n`,
    );
    expect((await checked(cwd, base, 1)).findings.some((r) => r.check === "I-03.immutable")).toBe(
      true,
    );
  },
  timeout,
);
