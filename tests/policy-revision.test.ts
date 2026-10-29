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
  await write(cwd, ".semlint/note.ts", denyPolicy);
  await write(cwd, ".leakcheck", "old\n");
  await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
  await write(cwd, "records/b.md", markdown("b", "", "safe\n"));
  const base = await advance(cwd);
  await write(cwd, ".leakcheck", "old\nGB21\n");
  const retained = await checked(cwd, base, 0);
  expect(retained.findings).toEqual([]);
  expect(retained.stderr).toContain("既存 1 件");
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
    await write(cwd, ".semlint/note.ts", denyPolicy);
    await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
    if (deleting) await write(cwd, ".leakcheck", "GB21\n");
    const base = await advance(cwd);
    if (deleting) await rm(`${cwd}/.leakcheck`);
    else await write(cwd, ".leakcheck", "GB21\n");
    const result = await checked(cwd, base, 0);
    expect(result.findings).toEqual([]);
    expect(result.stderr).toContain(deleting ? "既存 0 件" : "既存 1 件");
  }
});

test("policy alpha checks history without rules, uses alpha inputs and config, and skips I-09", async () => {
  const { cwd } = await repo({}, 'branch="audit-base"\n');
  await rm(`${cwd}/semlint.toml`);
  await rm(`${cwd}/.semlint`, { recursive: true });
  await write(cwd, "records/a.md", markdown("a", "", "GB21\n"));
  const base = await advance(cwd);
  await write(cwd, "records/b.md", markdown("b", "", "safe\n"));
  const head = await advance(cwd);
  await write(
    cwd,
    "semlint.toml",
    'edition = 1\n[repo]\nname="audit"\nbranch="audit-base"\n[files]\ninputs=[".leakcheck"]\n',
  );
  await write(cwd, ".semlint/note.ts", denyPolicy);
  await write(cwd, ".leakcheck", "GB21\n");
  // A policy+record change must be permitted only with explicit --policy.
  await write(cwd, "records/b.md", markdown("b", "", "GB21\n"));
  const policy = await snapshot(cwd);
  await jj(cwd, "bookmark", "create", "alpha", "-r", policy);
  await jj(cwd, "bookmark", "create", "audit-base", "-r", base);
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  await jj(cwd, "git", "export");
  await jj(cwd, "git", "fetch", "--remote", "origin");
  await jj(cwd, "git", "export");
  const result = await dx(cwd, "check", "--policy", "alpha", "--base", base, head);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)).toEqual([]);
  expect(result.stderr).toBe(
    "semlint: --policy: I-09 の検査を省略します\n新しい finding 0 件 / 既存 1 件\n",
  );
  expect((await dx(cwd, "check", head, "--policy=alpha")).stdout).toBe(result.stdout);
  expect((await dx(cwd, "check", "--base", base, head)).exit).toBe(4);
  const implicit = await dx(cwd, "check", "--base", base, policy);
  expect(implicit.exit, implicit.stderr).toBe(1);
  expect(rows(implicit.stdout).some((f) => f.check === "I-09.policy")).toBe(true);
  const explicit = await dx(cwd, "check", "--policy=alpha", "--base", base, policy);
  expect(explicit.exit).toBe(1);
  expect(rows(explicit.stdout).some((f) => f.check === "I-09.policy")).toBe(false);
  expect(
    rows(explicit.stdout).some((f) => f.check === "deny" && f.id === "b" && f.new === true),
  ).toBe(true);
}, 30000);

test("omitting policy keeps default findings and stderr when inputs do not change", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  const head = await snapshot(cwd);
  const implicit = await dx(cwd, "check", "--base", base, head);
  const explicit = await dx(cwd, "check", "--base", base, head, `--policy=${head}`);
  expect(implicit.exit).toBe(1);
  expect(explicit.stdout).toBe(implicit.stdout);
  expect(explicit.exit).toBe(implicit.exit);
  expect(explicit.stderr).toBe(`semlint: --policy: I-09 の検査を省略します\n${implicit.stderr}`);
  expect(implicit.stderr).toBe("FINDINGS: 新しい finding 1 件 / 既存 0 件\n");
});

test("policy parsing rejects missing/repeated values and non-check commands; invalid revs fail closed", async () => {
  const { cwd, base } = await repo();
  for (const args of [
    ["check", "--policy"],
    ["check", "--policy="],
    ["check", "--policy", "@", "--policy=@"],
    ...["ls", "view", "review", "admit"].map((c) => [c, "--policy", "@"]),
  ])
    expect((await dx(cwd, ...args)).exit).toBe(2);
  for (const policy of ["missing", "all()"])
    expect((await dx(cwd, "check", "--base", base, "--policy", policy)).exit).toBe(4);
  expect((await dx(cwd, "check", "--help")).stdout).toContain("--policy");
});

const brokenInputPolicy = typeSource().replace(
  "views:",
  `treeChecks: [tree => tree.read(".leakcheck") === "broken" ? [{
    check: "input", path: ".leakcheck", field: "syntax", message: "broken input"
  }] : []], views:`,
);

test("I-02: adding only a broken input rejects; untouched input findings remain existing", async () => {
  const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
  await write(cwd, ".semlint/note.ts", brokenInputPolicy);
  const base = await advance(cwd);
  await write(cwd, ".leakcheck", "broken");
  const rejected = await checked(cwd, base, 1);
  expect(rejected.findings).toMatchObject([{ check: "input", path: ".leakcheck", new: true }]);
  const next = await advance(cwd);
  await write(cwd, "records/a.md", markdown("a"));
  const retained = await checked(cwd, next, 0);
  expect(retained.stderr).toContain("既存 1 件");
});

test("I-02: explicit policy compares input paths in base/head, not policy", async () => {
  const { cwd } = await repo({}, '[files]\ninputs=[".leakcheck"]\n');
  await write(cwd, ".semlint/note.ts", brokenInputPolicy);
  await write(cwd, ".leakcheck", "safe");
  const base = await advance(cwd);
  await write(cwd, ".leakcheck", "changed but safe");
  const head = await advance(cwd);
  await write(cwd, ".leakcheck", "broken");
  const policy = await snapshot(cwd);
  const result = await dx(cwd, "check", "--base", base, head, "--policy", policy);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout)).toMatchObject([{ path: ".leakcheck", new: true }]);
  // Policy has different bytes, but an unchanged base/head path stays existing.
  const retained = await dx(cwd, "check", "--base", head, head, "--policy", policy, "--all");
  expect(retained.exit, retained.stderr).toBe(0);
  expect(rows(retained.stdout)).toMatchObject([{ path: ".leakcheck", new: false }]);
  // A deletion is also a path change even though the overlay restores its content.
  await rm(`${cwd}/.leakcheck`);
  const deleted = await snapshot(cwd);
  const removed = await dx(cwd, "check", "--base", head, deleted, "--policy", policy);
  expect(removed.exit, removed.stderr).toBe(1);
  expect(rows(removed.stdout)).toMatchObject([{ path: ".leakcheck", new: true }]);
});

test("I-02: raw blob comparison covers config, rules and ignored binary bytes, not mode", async () => {
  const { chmod } = await import("node:fs/promises");
  for (const path of ["semlint.toml", ".semlint/helper.txt", "ignored.bin"]) {
    const { cwd } = await repo({}, '[files]\nignore=["ignored.bin"]\n');
    const policySource = typeSource().replace(
      "views:",
      `treeChecks: [() => [{ check: "auxiliary", path: ${JSON.stringify(path)},
        field: "stable", message: "existing auxiliary finding" }]], views:`,
    );
    await write(cwd, ".semlint/note.ts", policySource);
    if (path !== "semlint.toml") await write(cwd, path, "before");
    const base = await advance(cwd);
    // An executable-bit change does not change bytes and must remain existing.
    await chmod(`${cwd}/${path}`, 0o755);
    await checked(cwd, base, 0);
    if (path === "semlint.toml") {
      await write(
        cwd,
        path,
        'edition = 1\n[repo]\nname="fixture"\n# changed bytes\n[files]\nignore=["ignored.bin"]\n',
      );
    } else await write(cwd, path, "after");
    const result = await checked(cwd, base, 1);
    expect(result.findings).toMatchObject([{ check: "auxiliary", path, new: true }]);
  }
  // Two invalid UTF-8 blobs decode to the same replacement character. Their bytes differ.
  const { cwd } = await repo({}, '[files]\nignore=["ignored.bin"]\n');
  await write(
    cwd,
    ".semlint/note.ts",
    typeSource().replace(
      "views:",
      'treeChecks: [() => [{ check: "binary", path: "ignored.bin", message: "bad" }]], views:',
    ),
  );
  await Bun.write(`${cwd}/ignored.bin`, new Uint8Array([0xff]));
  const base = await advance(cwd);
  await Bun.write(`${cwd}/ignored.bin`, new Uint8Array([0xfe]));
  expect((await checked(cwd, base, 1)).findings).toMatchObject([{ check: "binary", new: true }]);
}, 60000);
