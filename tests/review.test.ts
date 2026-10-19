import {
  decode,
  spawn,
  value,
  dx,
  repo,
  write,
  snapshot,
  jj,
  markdown,
  rows,
  advance,
} from "./helpers.ts";
import { z } from "zod";

import { expect, test } from "bun:test";

import { assembleRequest, capEvidence, parseRubric } from "../src/review-request.ts";

const rubric =
  'rubric = "test/v1"\n[[criteria]]\nbit = 0\nid = "quality"\nquestion = "Is the account clear?"\n';
async function fixture(
  options: {
    place?: string;
    response?: string;
    exit?: number;
    command?: string[];
    extra?: string;
    format?: string;
  } = {},
) {
  const { cwd } = await repo({
    review: options.place ?? "file:verdicts/*.json",
    ...(options.format === undefined ? {} : { format: options.format }),
  });
  const command = options.command ?? [process.execPath, `${import.meta.dir}/fixtures/fake-jex.ts`];
  await write(
    cwd,
    "dx.toml",
    `[repo]\nname = "fixture"\n[review]\ncommand = ${JSON.stringify(command)}\n${options.extra ?? ""}`,
  );
  await write(cwd, ".dx/rubrics/r.toml", rubric);
  if (options.response !== undefined || options.exit !== undefined)
    await write(
      cwd,
      ".jex-fixture.json",
      JSON.stringify({ response: options.response, exit: options.exit }),
    );
  const base = await advance(cwd);
  await jj(cwd, "bookmark", "create", "review-base", "-r", base);
  // The configured base expression uses <branch>@<remote>.
  await write(
    cwd,
    "dx.toml",
    `[repo]\nname = "fixture"\nbranch = "alpha"\n[review]\ncommand = ${JSON.stringify(command)}\n${options.extra ?? ""}`,
  );
  // Keep configuration out of record changes.
  const cleanBase = await advance(cwd);
  // Import a local git ref as a tracked remote bookmark without networking.
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  const git = await spawn(["git", "update-ref", "refs/remotes/origin/alpha", cleanBase], { cwd });
  expect(git.exitCode).toBe(0);
  await jj(cwd, "git", "import");
  return { cwd, base: cleanBase };
}
async function review(cwd: string, rev?: string) {
  await snapshot(cwd);
  return dx(cwd, "review", ...(rev === undefined ? [] : [rev]));
}
test("passing sidecar verdict satisfies I-06 and is skipped on retry", async () => {
  const { cwd } = await fixture();
  const text = markdown("one");
  await write(cwd, "records/one.md", text);
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(0);
  const verdict = rows(result.stdout)[0];
  expect(verdict?.pass).toBe(true);
  expect(verdict?.by).toBe("process:jev/fake");
  expect(await Bun.file(`${cwd}/records/one.md`).text()).toBe(text);
  expect(await Bun.file(`${cwd}/verdicts/one.json`).exists()).toBe(true);
  await snapshot(cwd);
  expect((await dx(cwd, "check")).exit).toBe(0);
  expect((await review(cwd)).stdout).toBe("");
  expect(await Bun.file(`${cwd}/.jex-calls`).text()).toBe("1");
  const capture = decode(
    z.object({ questions: z.string(), files: z.record(z.string(), z.string()) }),
    await Bun.file(`${cwd}/.jex-capture.json`).text(),
  );
  expect(capture.questions).toContain('id = "quality"');
  expect(capture.questions).toContain('text = "Is the account clear?"');
  expect(capture.files["records/one.md"]).toBe(text);
}, 60000);
test("failed verdict is written with exit 1 and fails I-06", async () => {
  const { cwd } = await fixture({
    response: '{"model":"fake","bits":[{"id":"quality","p":0.2,"reason":"unclear"}]}',
    exit: 1,
  });
  await write(cwd, "records/one.md", markdown("one"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout)[0]?.pass).toBe(false);
  expect(rows(result.stdout)[0]?.bits).toBe(0);
  await snapshot(cwd);
  expect(rows((await dx(cwd, "check")).stdout).some((r) => r.check === "I-06.verdict")).toBe(true);
}, 60000);
test("I-10 blocks a record with a finding while reviewing clean records", async () => {
  const { cwd } = await fixture();
  await write(cwd, "records/bad.md", markdown("bad", "bad: true\n"));
  await write(cwd, "records/good.md", markdown("good"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout).some((r) => r.check === "quality" && r.id === "bad")).toBe(true);
  expect(result.stderr).toContain("REVIEW_BLOCKED: bad: I-10: 既存の finding 1 件を先に消す\n");
  expect(rows(result.stdout).some((r) => r.pass === true && r.id === "good")).toBe(true);
  expect(await Bun.file(`${cwd}/.jex-calls`).text()).toBe("1");
}, 60000);
test("I-10 blocks every member of a group finding and reviews the rest", async () => {
  const { cwd } = await fixture();
  const source = await Bun.file(`${cwd}/.dx/note.ts`).text();
  await write(
    cwd,
    ".dx/note.ts",
    source.replace(
      "checks: [",
      `treeChecks: [tree => { const ids = tree.records.filter(r => r.fields.pair === true).map(r => r.id);
    return ids.length > 1 ? [{ check: "pair", ids, path: "records", message: "pair" }] : []; }],
  checks: [`,
    ),
  );
  await advance(cwd);
  await write(cwd, "records/a.md", markdown("a", "pair: true\n"));
  await write(cwd, "records/b.md", markdown("b", "pair: true\n"));
  await write(cwd, "records/c.md", markdown("c"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(1);
  expect(result.stderr).toContain("REVIEW_BLOCKED: a: I-10: 既存の finding 1 件を先に消す\n");
  expect(result.stderr).toContain("REVIEW_BLOCKED: b: I-10: 既存の finding 1 件を先に消す\n");
  expect(rows(result.stdout).some((r) => r.pass === true && r.id === "c")).toBe(true);
  expect(await Bun.file(`${cwd}/.jex-calls`).text()).toBe("1");
}, 60000);
test("oversized record or questions refuse with exit 4, no command and empty stdout", async () => {
  for (const largeQuestion of [false, true]) {
    const { cwd } = await fixture();
    if (largeQuestion) {
      await write(
        cwd,
        ".dx/rubrics/r.toml",
        rubric.replace("Is the account clear?", "問".repeat(11000)),
      );
      const newBase = await advance(cwd);
      await spawn(["git", "update-ref", "refs/remotes/origin/alpha", newBase], { cwd });
      await jj(cwd, "git", "import");
    }
    await write(
      cwd,
      "records/one.md",
      markdown("one", "", largeQuestion ? "Body" : "あ".repeat(11000)),
    );
    const result = await review(cwd);
    expect(result.exit, result.stderr).toBe(4);
    expect(result.stdout).toBe("");
    expect(await Bun.file(`${cwd}/.jex-calls`).exists()).toBe(false);
    expect(await Bun.file(`${cwd}/records/one.md`).text()).not.toContain("review:");
  }
}, 60000);
test("missing jex is unavailable; malformed or incomplete output is undetermined", async () => {
  const unavailable = await fixture({ command: ["/no-such-dx-jex-command"] });
  await write(unavailable.cwd, "records/one.md", markdown("one"));
  const unavailableResult = await review(unavailable.cwd);
  expect(unavailableResult.exit, unavailableResult.stderr).toBe(3);
  expect(unavailableResult.stdout).toBe("");
  expect(unavailableResult.stderr).toContain("REVIEW_UNAVAILABLE");
  for (const response of [
    "broken",
    '{"model":"fake","bits":[]}',
    '{"model":"fake","bits":[{"id":"quality","p":2,"reason":"bad"}]}',
  ]) {
    const { cwd } = await fixture({ response, exit: 4 });
    const text = markdown("one");
    await write(cwd, "records/one.md", text);
    const result = await review(cwd);
    expect(result.exit, result.stderr).toBe(4);
    expect(result.stdout).toBe("");
    expect(await Bun.file(`${cwd}/records/one.md`).text()).toBe(text);
  }
}, 60000);
test("sidecar glob, shared JSON and TOML storage satisfy I-06 and retries", async () => {
  for (const place of [
    "file:verdicts/*.jsonl",
    "file:verdicts/all.json",
    "file:verdicts/all.toml",
  ]) {
    const { cwd } = await fixture({ place });
    await write(cwd, "records/one.md", markdown("one"));
    await write(cwd, "records/two.md", markdown("two"));
    const result = await review(cwd);
    expect(result.exit, result.stderr).toBe(0);
    expect(rows(result.stdout)).toHaveLength(2);
    await snapshot(cwd);
    expect((await dx(cwd, "check")).exit).toBe(0);
    expect((await review(cwd)).stdout).toBe("");
    expect(await Bun.file(`${cwd}/.jex-calls`).text()).toBe("2");
  }
}, 60000);
test("REV with a different working-copy record refuses before calling Jev", async () => {
  const { cwd } = await fixture();
  await write(cwd, "records/one.md", markdown("one"));
  const rev = await advance(cwd);
  await write(cwd, "records/one.md", markdown("one", "", "New content"));
  const result = await review(cwd, rev);
  expect(result.exit, result.stderr).toBe(4);
  expect(await Bun.file(`${cwd}/.jex-calls`).exists()).toBe(false);
}, 60000);
test("UTF-8 evidence and escaped JSON fit 30000 bytes without truncating record/questions", () => {
  const text = '😀日本語\\"\n'.repeat(3000);
  const evidence = [{ locator: "linked", status: "supplied", content: text }];
  const r = value(parseRubric(rubric));
  const request = value(assembleRequest("Record", r, evidence));
  const serialized = JSON.stringify(request);
  expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(30000);
  expect(serialized).not.toContain("�");
  expect(serialized).toContain("truncated at");
  expect(request.state.record).toBe("Record");
  for (let cap = 0; cap < 20; cap += 1) {
    const capped = capEvidence(evidence[0]!, cap);
    expect(capped.content).not.toContain("�");
  }
}, 60000);
test("custom format evidence policy supplies linked files through the revision tree", async () => {
  const { cwd } = await fixture();
  const typePath = `${cwd}/.dx/note.ts`;
  let type = await Bun.file(typePath).text();
  type = type
    .replace("import { defineType }", "import { defineType, markdownFrontmatter }")
    .replace(
      'format: "markdown-frontmatter"',
      `format: { ...markdownFrontmatter,
      evidence: (file, tree) => [{ locator: "evidence.txt", status: "supplied",
        content: tree.read("evidence.txt") }] }`,
    );
  await write(cwd, ".dx/note.ts", type);
  await write(cwd, "evidence.txt", "漢😀".repeat(10000));
  const base = await advance(cwd);
  await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  await jj(cwd, "git", "import");
  await write(cwd, "records/one.md", markdown("one"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(0);
  const capture = decode(
    z.object({ questions: z.string(), files: z.record(z.string(), z.string()) }),
    await Bun.file(`${cwd}/.jex-capture.json`).text(),
  );
  const evidence = capture.files["evidence.txt"];
  expect(evidence).toBeDefined();
  expect(Buffer.byteLength(evidence ?? "")).toBeLessThanOrEqual(30000);
  expect(evidence).toContain("truncated at");
  expect(evidence).not.toContain("�");
}, 60000);
test("external review waits report liveness and complete", async () => {
  const { cwd } = await fixture();
  await write(cwd, ".jex-fixture.json", JSON.stringify({ delay_ms: 3500 }));
  const base = await advance(cwd);
  await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  await jj(cwd, "git", "import");
  await write(cwd, "records/one.md", markdown("one"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(result.stderr).toContain("dx: waiting for jex…");
}, 60000);
test("partial verdicts survive a later unavailable response and retry skips them", async () => {
  const { cwd } = await fixture();
  await write(cwd, ".jex-fixture.json", JSON.stringify({ fail_on_call: 2 }));
  const base = await advance(cwd);
  await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  await jj(cwd, "git", "import");
  await write(cwd, "records/a.md", markdown("a"));
  await write(cwd, "records/b.md", markdown("b"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(3);
  expect(rows(result.stdout).map((r) => r.id)).toEqual(["a"]);
  expect(await Bun.file(`${cwd}/verdicts/a.json`).exists()).toBe(true);
  expect(await Bun.file(`${cwd}/verdicts/b.json`).exists()).toBe(false);
  const retry = await review(cwd);
  expect(retry.exit, retry.stderr).toBe(0);
  expect(rows(retry.stdout).map((r) => r.id)).toEqual(["b"]);
  expect(await Bun.file(`${cwd}/.jex-calls`).text()).toBe("3");
}, 60000);
test("immutable TOML fragments use sidecars even under a default ignored directory", async () => {
  const { cwd } = await fixture({ place: "file:tools/verdicts/*.json", format: "toml" });
  const type = await Bun.file(`${cwd}/.dx/note.ts`).text();
  await write(cwd, ".dx/note.ts", type.replace("immutable: false", "immutable: true"));
  const base = await advance(cwd);
  await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  await jj(cwd, "git", "import");
  const text =
    '[[records]]\nid="one"\ntitle="One"\nby="author"\n[[records]]\nid="two"\ntitle="Two"\nby="author"\n';
  await write(cwd, "records/notes.toml", text);
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)).toHaveLength(2);
  expect(await Bun.file(`${cwd}/records/notes.toml`).text()).toBe(text);
  await snapshot(cwd);
  expect((await dx(cwd, "check")).exit).toBe(0);
}, 60000);
test("new malformed review records block I-10; unchanged malformed records are outside review", async () => {
  const { cwd } = await fixture();
  await write(cwd, "records/bad.md", "---\nid: [\n---\n");
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout)[0]?.check).toBe("format");
  expect(await Bun.file(`${cwd}/.jex-calls`).exists()).toBe(false);
  const base = await advance(cwd);
  await spawn(["git", "update-ref", "refs/remotes/origin/alpha", base], { cwd });
  await jj(cwd, "git", "import");
  const unchanged = await review(cwd);
  expect(unchanged.exit, unchanged.stderr).toBe(0);
  expect(unchanged.stdout).toBe("");
}, 60000);
test("dx review sends questions and repository paths to jex and satisfies I-06", async () => {
  const { cwd } = await fixture();
  await write(cwd, "records/one.md", markdown("one"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)[0]?.pass).toBe(true);
  const capture = decode(
    z.object({ questions: z.string(), files: z.record(z.string(), z.string()) }),
    await Bun.file(`${cwd}/.jex-capture.json`).text(),
  );
  expect(capture.questions).toContain("schema = 1");
  expect(capture.questions).toContain('id = "quality"');
  expect(capture.files["records/one.md"]).toBe(markdown("one"));
  await snapshot(cwd);
  expect((await dx(cwd, "check")).exit).toBe(0);
}, 60000);
test("the model field is included in the complete 30000-byte UTF-8 request budget", () => {
  const parsed = value(parseRubric(rubric));
  const record = "😀".repeat(7000);
  const evidence = [{ locator: "linked", status: "supplied", content: "資料".repeat(10000) }];
  const request = value(assembleRequest(record, parsed, evidence));
  expect(request.model).toBe("jev-latest");
  expect(request.state.record).toBe(record);
  expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThanOrEqual(30000);
  const oversized = assembleRequest(record + "😀".repeat(500), parsed, evidence);
  expect(oversized.isErr()).toBe(true);
  if (oversized.isErr()) expect(oversized.error).toContain("exceeds 30000");
}, 60000);

test("retired review.pass is an unknown key", async () => {
  const { cwd } = await fixture({ extra: "pass = 0.9\n" });
  await write(cwd, "records/one.md", markdown("one"));
  const result = await review(cwd);
  expect(result.exit, result.stderr).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("pass");
  expect(await Bun.file(`${cwd}/calls`).exists()).toBe(false);
});
