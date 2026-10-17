import { test, expect } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import fixture from "./fixtures/retrospectives-review.json";
import { repo, write, jj, advance, snapshot, dx, checked, markdown, rows } from "./helpers.ts";
import { parseRecords, recordSha256, sha256 } from "../src/formats.ts";
import { requireValue } from "../src/errors.ts";

test("I-06 author policy accepts machines for unknown authors and still rejects self-review", async () => {
  for (const place of ["frontmatter", "file:verdicts/*.json"]) {
    const { cwd, base } = await repo({ review: place });
    for (const [author, reviewer, expected] of [
      [undefined, "process:jev/fake", 0],
      [undefined, "human:reviewer", 1],
      [undefined, "agent:reviewer", 1],
      [undefined, "processing:reviewer", 1],
      ["author", "author", 1],
      ["author", "human:reviewer", 0],
      ["process:jev/fake", "process:jev/fake", 1],
    ] satisfies readonly (readonly [string | undefined, string, 0 | 1])[]) {
      const withoutAuthor = markdown("one").replace("by: author\n", "");
      const text =
        author === undefined
          ? withoutAuthor
          : withoutAuthor.replace(
              "title: Title\n",
              `title: Title\nby: ${JSON.stringify(author)}\n`,
            );
      const file = requireValue(
        parseRecords("records/one.md", text, "markdown-frontmatter")[0],
        "fixture",
      );
      const verdict = {
        v: 1,
        id: "one",
        sha256: recordSha256(file),
        rubric: "rubrics/r.toml",
        rubric_sha256: sha256('rubric = "r"\n'),
        by: reviewer,
        at: "2026-10-17T00:00:00Z",
        bits: 1,
        p: [0.9],
        pass: true,
      };
      const record =
        place === "frontmatter"
          ? text.replace("---\n", `---\nreview: ${JSON.stringify(verdict)}\n`)
          : text;
      await write(cwd, "records/one.md", record);
      if (place !== "frontmatter") await write(cwd, "verdicts/one.json", JSON.stringify(verdict));
      const result = await checked(cwd, base, expected);
      expect(result.findings.filter((f) => f.check === "I-06.verdict")).toHaveLength(expected);
    }
  }
}, 60000);

test("real retrospective policy and six authorless records review into .dx sidecars from an empty child", async () => {
  const { cwd } = await repo();
  await rm(join(cwd, ".dx/note.ts"));
  for (const [path, text] of Object.entries(fixture.policy)) await write(cwd, path, text);
  await write(
    cwd,
    "dx.toml",
    `[repo]\nname = "retrospectives"\n[review]\ncommand = ${JSON.stringify([
      process.execPath,
      join(import.meta.dir, "fixtures/jev-command.ts"),
    ])}\n[files]\nignore = ["**/node_modules/**"]\n`,
  );
  const base = await advance(cwd);
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  const imported = Bun.spawnSync(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  expect(imported.exitCode).toBe(0);
  await jj(cwd, "git", "import");
  for (const [path, text] of Object.entries(fixture.records)) await write(cwd, path, text);
  const head = await advance(cwd);
  await jj(cwd, "bookmark", "create", "alpha", "-r", head);
  await snapshot(cwd);
  const before = await dx(cwd, "check", "--base", "alpha@origin", "@");
  expect(before.exit, before.stderr).toBe(1);
  expect(rows(before.stdout).filter((f) => f.check === "I-06.verdict" && f.new)).toHaveLength(6);
  const reviewed = await dx(cwd, "review");
  expect(reviewed.exit, reviewed.stderr + reviewed.stdout).toBe(0);
  const verdicts = rows(reviewed.stdout);
  expect(verdicts).toHaveLength(6);
  for (const verdict of verdicts) {
    expect(verdict.by).toBe("process:jev/fake");
    expect(verdict.pass).toBe(true);
    expect(
      await Bun.file(
        join(
          cwd,
          ".dx/verdicts",
          encodeURIComponent(String(verdict.id)).replaceAll(".", "%2E") + ".jsonl",
        ),
      ).exists(),
    ).toBe(true);
  }
  for (const [path, text] of Object.entries(fixture.records))
    expect(await Bun.file(join(cwd, path)).text()).toBe(text);
  // The fake transport capture is test output, not retrospective infrastructure.
  await rm(join(cwd, "request.json"));
  await snapshot(cwd);
  const after = await dx(cwd, "check", "--base", "alpha@origin", "@");
  expect(after.exit, after.stderr + after.stdout).toBe(0);
  expect(rows(after.stdout).filter((f) => f.check === "I-06.verdict" && f.new)).toHaveLength(0);
  expect((await dx(cwd, "review")).stdout).toBe("");
}, 60000);
