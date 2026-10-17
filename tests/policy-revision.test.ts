import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
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

const denyPolicy = typeSource().replace(
  "views:",
  `treeChecks: [tree => tree.records.filter(r =>
    (tree.read(".leakcheck") ?? "").split("\\n").filter(Boolean).some(p => tree.read(r.path)?.includes(p))
  ).map(r => ({ check: "deny", id: r.id, path: r.path, field: "body", message: "denied" }))], views:`,
);

test("head inputs apply on both sides: adding a pattern retains findings; editing a record rejects", async () => {
  const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
  await write(cwd, ".dx/note.ts", denyPolicy);
  await write(cwd, ".leakcheck", "old\n");
  await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
  await write(cwd, "records/b.md", markdown("b", "", "safe\n"));
  const base = await advance(cwd);
  await write(cwd, ".leakcheck", "old\nGB21\n");
  const retained = await checked(cwd, base, 0);
  expect(retained.findings.filter((f) => f.check === "deny")).toMatchObject([
    { new: false, id: "a" },
  ]);
  const next = await advance(cwd);
  await write(cwd, "records/a.md", markdown("a", "", "GB21 changed\n"));
  await write(cwd, "records/b.md", markdown("b", "", "GB21\n"));
  const changed = await checked(cwd, next, 1);
  expect(changed.findings.filter((f) => f.check === "deny")).toMatchObject([
    { new: true, id: "a" },
    { new: true, id: "b" },
  ]);
});

test("input additions and deletions use the policy file set on both sides", async () => {
  for (const deleting of [false, true]) {
    const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
    await write(cwd, ".dx/note.ts", denyPolicy);
    await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
    if (deleting) await write(cwd, ".leakcheck", "GB21\n");
    const base = await advance(cwd);
    if (deleting) await rm(`${cwd}/.leakcheck`);
    else await write(cwd, ".leakcheck", "GB21\n");
    const result = await checked(cwd, base, 0);
    expect(result.findings).toHaveLength(deleting ? 0 : 1);
    expect(result.findings.every((f) => f.new === false)).toBe(true);
  }
});

test("policy alpha checks history without rules, uses alpha inputs and config, and skips I-09", async () => {
  const { cwd } = await repo();
  await rm(`${cwd}/dx.toml`);
  await rm(`${cwd}/.dx`, { recursive: true });
  await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
  const base = await advance(cwd);
  await write(cwd, "records/b.md", markdown("b", "", "safe\n"));
  const head = await advance(cwd);
  await write(
    cwd,
    "dx.toml",
    '[repo]\nname="audit"\nbranch="audit-base"\n[files]\ninputs=[".leakcheck"]\n',
  );
  await write(cwd, ".dx/note.ts", denyPolicy);
  await write(cwd, ".leakcheck", "GB21\n");
  // A policy+record change must be permitted only with explicit --policy.
  await write(cwd, "records/b.md", markdown("b", "", "GB21\n"));
  const policy = await snapshot(cwd);
  await jj(cwd, "bookmark", "create", "alpha", "-r", policy);
  await jj(cwd, "bookmark", "create", "audit-base", "-r", base);
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  await jj(cwd, "git", "export");
  await jj(cwd, "git", "fetch", "--remote", "origin");
  const result = await dx(cwd, "check", "--policy", "alpha", "--base", base, head);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)).toMatchObject([{ check: "deny", id: "a", new: false }]);
  expect(result.stderr).toBe(
    "dx: --policy: I-09 の検査を省略します\n新しい finding 0 件 / 既存 1 件\n",
  );
  expect((await dx(cwd, "check", head, "--policy=alpha")).stdout).toBe(result.stdout);
  expect((await dx(cwd, "check", "--base", base, head)).exit).toBe(4);
  const implicit = await dx(cwd, "check", "--base", base, policy);
  expect(implicit.exit).toBe(1);
  expect(rows(implicit.stdout).some((f) => f.check === "I-09.policy")).toBe(true);
  const explicit = await dx(cwd, "check", "--policy=alpha", "--base", base, policy);
  expect(explicit.exit).toBe(1);
  expect(rows(explicit.stdout).some((f) => f.check === "I-09.policy")).toBe(false);
  expect(
    rows(explicit.stdout).some((f) => f.check === "deny" && f.id === "b" && f.new === true),
  ).toBe(true);
});

test("omitting policy keeps default findings and stderr when inputs do not change", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  const head = await snapshot(cwd);
  const implicit = await dx(cwd, "check", "--base", base, head);
  const explicit = await dx(cwd, "check", "--base", base, head, `--policy=${head}`);
  expect(implicit.exit).toBe(1);
  expect(explicit.stdout).toBe(implicit.stdout);
  expect(explicit.exit).toBe(implicit.exit);
  expect(explicit.stderr).toBe(`dx: --policy: I-09 の検査を省略します\n${implicit.stderr}`);
  expect(implicit.stderr).toBe("FINDINGS: 新しい finding 1 件 / 既存 0 件\n");
});

test("policy parsing rejects missing/repeated values and non-check commands; invalid revs fail closed", async () => {
  const { cwd, base } = await repo();
  for (const args of [
    ["check", "--policy"],
    ["check", "--policy="],
    ["check", "--policy", "@", "--policy=@"],
    ...["ls", "view", "review", "land"].map((c) => [c, "--policy", "@"]),
  ])
    expect((await dx(cwd, ...args)).exit).toBe(2);
  for (const policy of ["missing", "all()"])
    expect((await dx(cwd, "check", "--base", base, "--policy", policy)).exit).toBe(4);
  expect((await dx(cwd, "check", "--help")).stdout).toContain("--policy");
});
