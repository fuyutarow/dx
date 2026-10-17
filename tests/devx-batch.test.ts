import { expect, test } from "bun:test";
import {
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

test("--all restores existing findings without changing exits or summaries, including --policy", async () => {
  const { cwd } = await repo();
  await write(cwd, "records/old.md", markdown("old", "bad: true\n"));
  const base = await advance(cwd);
  const retained = await dx(cwd, "check", "--base", base, "--all");
  expect(retained.exit).toBe(0);
  expect(rows(retained.stdout)).toMatchObject([{ id: "old", new: false }]);
  await write(cwd, "records/new.md", markdown("new", "bad: true\n"));
  await snapshot(cwd);
  for (const extra of [[], ["--policy", "@"]]) {
    const current = await dx(cwd, "check", "--base", base, ...extra);
    const all = await dx(cwd, "check", "--base", base, "--all", ...extra);
    expect(all.exit).toBe(1);
    expect(current.exit).toBe(all.exit);
    expect(current.stderr).toBe(all.stderr);
    expect(rows(all.stdout)).toMatchObject([
      { id: "new", new: true },
      { id: "old", new: false },
    ]);
    expect(rows(current.stdout)).toEqual(rows(all.stdout).filter((f) => f.new === true));
  }
}, 60000);

test("--all includes input findings that remain existing even against root()", async () => {
  const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
  await write(cwd, ".leakcheck", "invalid pattern");
  await write(
    cwd,
    ".dx/note.ts",
    typeSource().replace(
      "views:",
      `treeChecks: [tree => [{ check: "policy.input", id: "policy:input", path: ".leakcheck", field: "pattern", message: tree.read(".leakcheck") }]], views:`,
    ),
  );
  await snapshot(cwd);
  const current = await dx(cwd, "check", "--base", "root()");
  const all = await dx(cwd, "check", "--base", "root()", "--all");
  expect(current.exit).toBe(0);
  expect(all.exit).toBe(0);
  expect(current.stdout).toBe("");
  expect(current.stderr).toBe(all.stderr);
  expect(rows(all.stdout)).toMatchObject([{ check: "policy.input", new: false }]);
});

test("--all is a check-only boolean flag and appears in help", async () => {
  const { cwd } = await repo();
  const help = await dx(cwd, "check", "--help");
  expect(help.exit).toBe(0);
  expect(help.stdout).toContain("--all");
  for (const args of [
    ["check", "--all", "--all"],
    ["check", "--all=true"],
    ["review", "--all"],
    ["ls", "--all"],
    ["view", "--all"],
    ["land", "--all"],
  ]) {
    const result = await dx(cwd, ...args);
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe("");
  }
});

test("absent default remote branch uses root; explicit missing base still fails", async () => {
  const { cwd } = await repo();
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  const head = await snapshot(cwd);
  const implicit = await dx(cwd, "check");
  const explicit = await dx(cwd, "check", "--base", "root()");
  expect(implicit.exit).toBe(1);
  expect(implicit.stdout).toBe(explicit.stdout);
  expect(implicit.stderr).toBe("base: remote branch absent; using root()\n" + explicit.stderr);
  const missing = await dx(cwd, "check", "--base", "absent@origin");
  expect(missing.exit).toBe(4);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).not.toContain("using root()");
  await jj(cwd, "bookmark", "create", "alpha", "-r", head);
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  await jj(cwd, "git", "export");
  await jj(cwd, "git", "fetch", "--remote", "origin");
  const present = await dx(cwd, "check");
  expect(present.exit).toBe(0);
  expect(present.stdout).toBe("");
  expect(present.stderr).toBe("新しい finding 0 件 / 既存 1 件\n");
}, 60000);

test("default ignore excludes dependencies at every depth; explicit ignore replaces it", async () => {
  const { cwd } = await repo({}, "[files]\nstrict=true\n");
  await write(cwd, "node_modules/dep/file.txt", "dependency");
  await write(cwd, "app/node_modules/dep/file.txt", "dependency");
  await checked(cwd, "root()", 0);
  await write(cwd, "dx.toml", '[repo]\nname="fixture"\n[files]\nstrict=true\nignore=[]\n');
  const included = await checked(cwd, "root()", 1);
  expect(
    new Set(included.findings.filter((f) => f.check === "files.strict").map((f) => f.path)),
  ).toEqual(new Set(["app/node_modules/dep/file.txt", "node_modules/dep/file.txt"]));
}, 60000);

for (const [label, files, path, cause] of [
  ["syntax", { ".dx/note.ts": "export default { broken: ; };" }, ".dx/note.ts", "Unexpected"],
  [
    "missing import",
    { ".dx/note.ts": 'import x from "./helpers/missing.ts"; export default x;' },
    ".dx/note.ts",
    "missing revision module",
  ],
  [
    "runtime",
    {
      ".dx/note.ts": 'import x from "./helpers/throw.ts"; export default x;',
      ".dx/helpers/throw.ts":
        'throw new Error("policy exploded\\nsecond line"); export default {};',
    },
    ".dx/helpers/throw.ts",
    "policy exploded",
  ],
] as const) {
  test(`policy ${label} failure names its module and cause in one stderr line`, async () => {
    const { cwd, base } = await repo();
    for (const [name, source] of Object.entries(files)) await write(cwd, name, source);
    await snapshot(cwd);
    const result = await dx(cwd, "check", "--base", base);
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith(`UNDETERMINED:policy: ${path}: `);
    expect(result.stderr).toContain(cause);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
  });
}
