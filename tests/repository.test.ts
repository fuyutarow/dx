import { value, expectError, advance, jj, markdown, repo, snapshot, write } from "./helpers.ts";
import { expect, test } from "bun:test";
import { chmod, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { RevisionReader, show } from "../src/repository.ts";
import { readSnapshot, snapshotCache } from "../src/collection.ts";
import { readConfig } from "../src/config.ts";
import { CURRENT } from "../src/layout.ts";
import { loadTypes } from "../src/policy.ts";

test("batch framing preserves empty, binary, Unicode and unusual-path blobs", async () => {
  const { cwd } = await repo();
  const files = new Map([
    ["empty", ""],
    ['spaces : * "\n雪', "雪\0blob 12\n\nno final newline"],
    ["__proto__", "prototype-safe"],
    ["executable", "#!/bin/sh\n"],
    ["duplicate", "#!/bin/sh\n"],
  ]);
  for (const [path, text] of files) await write(cwd, path, text);
  await chmod(join(cwd, "executable"), 0o755);
  const rev = await snapshot(cwd);
  const reader = new RevisionReader(cwd, 20000);
  const entries = value(await reader.tree(rev)).filter((e) => files.has(e.path));
  expect(entries).toHaveLength(files.size);
  const contents = value(await reader.read(entries));
  for (const [path, text] of files) {
    expect(contents.get(path)).toBe(text);
    expect(contents.get(path)).toBe(value(await show(cwd, rev, path, 20000)));
  }
  expect(value(await reader.read(entries))).toEqual(contents);
});

test("same blobs across revisions are parsed once, while changed blobs are parsed again", async () => {
  const { cwd } = await repo();
  await write(cwd, "records/a.md", markdown("a"));
  await write(cwd, "records/b.md", markdown("b"));
  const base = await advance(cwd);
  await write(cwd, "records/b.md", markdown("b", "", "Changed\n"));
  const head = await snapshot(cwd);
  const config = value(readConfig(value(await show(cwd, head, "semlint.toml", 20000)), CURRENT));
  const types = value(
    await loadTypes({
      ".semlint/note.ts": value(await show(cwd, head, ".semlint/note.ts", 20000)),
    }),
  );
  const cache = snapshotCache(cwd, 20000);
  const current = value(await readSnapshot(cwd, head, config, types, 20000, cache));
  const previous = value(await readSnapshot(cwd, base, config, types, 20000, cache));
  expect([...cache.parsed.values()].reduce((n, rows) => n + rows.size, 0)).toBe(3);
  expect(previous.records.map((r) => r.id)).toEqual(["a", "b"]);
  expect(current.records[0]?.sha256).toBe(previous.records[0]?.sha256);
  expect(current.records[1]?.sha256).not.toBe(previous.records[1]?.sha256);
});

test("batch reads reject symlinks and unresolved conflicts", async () => {
  const { cwd } = await repo();
  await symlink("/etc/passwd", join(cwd, "link"));
  const linked = await snapshot(cwd);
  const reader = new RevisionReader(cwd, 20000);
  expectError(
    await reader.read(value(await reader.tree(linked)).filter((e) => e.path === "link")),
    "unsupported or conflicted",
  );
  await unlink(join(cwd, "link"));
  await write(cwd, "conflict", "base\n");
  const base = await advance(cwd);
  await write(cwd, "conflict", "left\n");
  const left = await snapshot(cwd);
  await jj(cwd, "new", base);
  await write(cwd, "conflict", "right\n");
  const right = await snapshot(cwd);
  await jj(cwd, "new", left, right);
  const merged = await snapshot(cwd);
  const entries = value(await reader.tree(merged)).filter((e) => e.path === "conflict");
  expect(entries[0]?.kind).toBe("conflict");
  expectError(await reader.read(entries), "unsupported or conflicted");
});

test("missing objects fail closed instead of yielding empty contents", async () => {
  const { cwd } = await repo();
  const reader = new RevisionReader(cwd, 20000);
  expectError(
    await reader.read([{ path: "missing", kind: "file", id: "1".repeat(40) }]),
    "invalid or missing git blob",
  );
});
