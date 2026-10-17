import { test, expect } from "bun:test";
import { readdir, readFile, lstat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../src/config.ts";
import { sha256 } from "../src/formats.ts";
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

const timeout = 60000;
async function inventory(root: string, path = ""): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const name of (await readdir(join(root, path))).toSorted()) {
    const relative = path === "" ? name : `${path}/${name}`;
    const absolute = join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) Object.assign(entries, await inventory(root, relative));
    else if (stat.isFile())
      entries[relative] = sha256((await readFile(absolute)).toString("base64"));
  }
  return entries;
}

test(
  "I-07: all four commands are deterministic and leave every repo byte unchanged",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    await snapshot(cwd);
    await write(cwd, "records/unsnapshotted.md", markdown("not-in-revision"));
    const before = await inventory(cwd);
    for (const args of [
      ["ls"],
      ["check", "--base", base],
      ["view", "index"],
      ["view", "--list"],
      ["schema"],
    ]) {
      const first = await dx(cwd, ...args);
      const second = await dx(cwd, ...args);
      expect(first.exit, first.stderr).toBe(0);
      expect(first).toEqual(second);
      if (args[0] === "ls") expect(rows(first.stdout).map((r) => r.id)).toEqual(["a"]);
    }
    expect(await inventory(cwd)).toEqual(before);
  },
  timeout,
);

test(
  "I-07: missing REV / type / view fail closed with empty stdout",
  async () => {
    const { cwd } = await repo();
    for (const args of [
      ["ls", "does-not-exist"],
      ["check", "--base", "does-not-exist"],
      ["view", "index", "does-not-exist"],
      ["view", "absent"],
      ["schema", "absent"],
    ]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, `${args}: ${result.stderr}`).toBe(4);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("UNDETERMINED:");
    }
  },
  timeout,
);

test(
  "I-07: malformed / absent policy, throwing checks and wrong callback outputs return 4",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    for (const source of [
      "not TypeScript!",
      'export default { name: "note" }',
      typeSource().replace(
        "record.fields.bad === true",
        '(() => { throw Error("failed check"); })()',
      ),
      typeSource()
        .replace("checks: [(record)", "checks: [(_record)")
        .replace(
          'record.fields.bad === true ? [{ check: "quality", id: record.id,\n    path: record.path, field: "bad", message: "bad record" }] : []',
          "42",
        ),
    ]) {
      await write(cwd, ".dx/note.ts", source);
      await snapshot(cwd);
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit, result.stderr).toBe(4);
      expect(result.stdout).toBe("");
    }
  },
  timeout,
);

test(
  "limits.record_bytes, limits.records and limits.links_per_record fail closed",
  async () => {
    for (const [config, contents] of [
      ["record_bytes=10", [markdown("a")]],
      ["records=1", [markdown("a"), markdown("b")]],
      ["links_per_record=1", [markdown("a", "next: [b, c]\n"), markdown("b"), markdown("c")]],
    ] satisfies [string, string[]][]) {
      const { cwd, base } = await repo({}, `[limits]\n${config}\n`);
      for (const [index, text] of contents.entries()) await write(cwd, `records/${index}.md`, text);
      await snapshot(cwd);
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit, result.stderr).toBe(4);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`limits.${config.split("=")[0]}`);
    }
  },
  timeout,
);

test(
  "limits.check_seconds stops a synchronous infinite policy loop",
  async () => {
    const { cwd, base } = await repo({}, "[limits]\ncheck_seconds=2.5\n");
    await write(cwd, ".dx/note.ts", `${typeSource()}\nwhile (true) {}\n`);
    await snapshot(cwd);
    const start = performance.now();
    const result = await dx(cwd, "check", "--base", base);
    expect(result.exit, result.stderr).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("limits.check_seconds");
    expect(performance.now() - start).toBeLessThan(10000);
  },
  timeout,
);

test("configuration defaults match §6 exactly", () => {
  expect(readConfig('[repo]\nname="fixture"\n')).toEqual({
    repo: { name: "fixture", remote: "origin", branch: "alpha" },
    review: { command: ["agx", "jev"], pass: 0.5 },
    limits: { record_bytes: 4194304, records: 200000, links_per_record: 10000, check_seconds: 120 },
    files: { ignore: ["records/raw/**", "tools/**", "README.md"], strict: false },
  });
});

test(
  "strict / ignores: report every untyped path, exempt infrastructure and sidecars",
  async () => {
    const { cwd, base } = await repo({}, '[files]\nstrict=true\nignore=["ignored/**"]\n');
    await write(cwd, "unknown.txt", "unknown");
    await write(cwd, "ignored/a.md", "invalid frontmatter");
    const result = await checked(cwd, base, 1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.check).toBe("files.strict");
    expect(result.findings[0]?.path).toBe("unknown.txt");
  },
  timeout,
);

test(
  "C1: unknown/repeated options, extras, missing values, short options exit 2",
  async () => {
    const { cwd } = await repo();
    for (const args of [
      [],
      ["bogus"],
      ["ls", "--bogus"],
      ["ls", "a", "b"],
      ["ls", "-v"],
      ["ls", "-r", "@"],
      ["ls", "--help", "-h"],
      ["check", "--base", "@", "--base=@"],
      ["check", "--base"],
      ["check", "--base="],
      ["view"],
      ["view", "--list", "index"],
      ["view", "--list", "--list"],
      ["view", "a", "b", "c"],
      ["schema", "a", "b"],
      ["view", "--list=false"],
    ]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, `${args}: ${result.stderr}`).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("USAGE:");
    }
    for (const args of [["--help"], ["-h"], ["check", "--help"], ["view", "-h"]]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, result.stderr).toBe(0);
      expect(result.stdout).toContain("USAGE:");
    }
  },
  timeout,
);

test(
  "C1: '--' makes subsequent tokens positional; options may follow REV",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    await snapshot(cwd);
    expect((await dx(cwd, "ls", "--", "@")).exit).toBe(0);
    expect((await dx(cwd, "check", "@", `--base=${base}`)).exit).toBe(0);
    expect((await dx(cwd, "view", "--", "index", "@")).exit).toBe(0);
    const result = await dx(cwd, "ls", "--", "--help");
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
  },
  timeout,
);

test(
  "revision loader resolves .dx-relative helpers without touching disk modules",
  async () => {
    const { cwd } = await repo();
    await write(
      cwd,
      ".dx/helpers/identity.ts",
      "export const identity = file => String(file.fields.id);\n",
    );
    await write(
      cwd,
      ".dx/note.ts",
      typeSource()
        .replace(
          'import { z } from "zod";',
          'import { z } from "zod"; import { identity } from "./helpers/identity.ts";',
        )
        .replace("id: file => String(file.fields.id)", "id: identity"),
    );
    const base = await advance(cwd);
    await write(cwd, "records/a.md", markdown("a"));
    await checked(cwd, base, 0);
  },
  timeout,
);

test(
  "symlink records cannot expose external files",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/placeholder.md", markdown("a"));
    await symlink("/etc/passwd", join(cwd, "records/link.md"));
    await snapshot(cwd);
    const result = await dx(cwd, "ls");
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
  },
  timeout,
);

test(
  "unreadable record formats produce findings in check and exit 4 in ls",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", "missing frontmatter");
    const result = await checked(cwd, base, 1);
    expect(result.findings[0]?.check).toBe("format");
    const list = await dx(cwd, "ls");
    expect(list.exit).toBe(4);
    expect(list.stdout).toBe("");
  },
  timeout,
);

test(
  "invalid config and invalid schema declarations fail closed",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "dx.toml", '[repo]\nname="fixture"\n[limits]\nrecords=0\n');
    await snapshot(cwd);
    const config = await dx(cwd, "schema");
    expect(config.exit).toBe(4);
    expect(config.stdout).toBe("");
    await write(cwd, "dx.toml", '[repo]\nname="fixture"\n');
    await write(
      cwd,
      ".dx/note.ts",
      typeSource().replace(
        "schema: z.looseObject({ id: z.string(), title: z.string().min(1) })",
        "schema: {}",
      ),
    );
    await snapshot(cwd);
    const invalidType = await dx(cwd, "schema");
    expect(invalidType.exit).toBe(4);
    expect(invalidType.stdout).toBe("");
  },
  timeout,
);

test(
  "fileset literals preserve spaces and metacharacters in record paths",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, 'records/a [0] "quoted".md', markdown("a"));
    await checked(cwd, base, 0);
    const result = await dx(cwd, "ls");
    expect(result.exit, result.stderr).toBe(0);
    expect(rows(result.stdout)[0]?.path).toBe('records/a [0] "quoted".md');
  },
  timeout,
);
