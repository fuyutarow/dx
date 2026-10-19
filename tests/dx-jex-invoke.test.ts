import { expect, test } from "bun:test";
import { dx, markdown, repo, rows, snapshot, write, jj, spawn, decode } from "./helpers.ts";
import { z } from "../.dx-preset/zod.ts";
import type { Evidence } from "../src/model.ts";

const rubric = (count = 1) =>
  `rubric = "test/v1"\n${Array.from({ length: count }, (_, index) => `[[criteria]]\nbit = ${index}\nid = "q${index + 1}"\nquestion = "Question ${index + 1}?"\n`).join("\n")}`;
const response = (p = 0.9) =>
  JSON.stringify({
    model: "fake-model",
    bits: [{ id: "q1", p, reason: "because" }],
  });

async function fixture(options: { exit?: number; output?: string; criteria?: number } = {}) {
  const logPath = `/tmp/dx-jex-fixture-${crypto.randomUUID()}.json`;
  const code = `const log = ${JSON.stringify(logPath)};
const output = ${JSON.stringify(options.output ?? response())};
const exit = ${options.exit ?? 0};
const args = Bun.argv.slice(1);
const files = await Promise.all(args.map(async path => ({ path, text: await Bun.file(path).text().catch(() => "missing") })));
await Bun.write(log, JSON.stringify({ cwd: process.cwd(), args, files }));
process.stdout.write(output);
process.exit(Number(exit));`;
  const command = [process.execPath, "-e", code];
  const { cwd } = await repo(
    { review: "file:verdicts/*.json" },
    `[review]\ncommand = ${JSON.stringify(command)}\n`,
  );
  await write(cwd, ".dx/rubrics/r.toml", rubric(options.criteria));
  await jj(cwd, "new", "-m", "review base");
  const cleanBase = await jj(cwd, "log", "--no-graph", "-r", "@-", "-T", "commit_id");
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  const git = await spawn(["git", "update-ref", "refs/remotes/origin/alpha", cleanBase], { cwd });
  expect(git.exitCode).toBe(0);
  await jj(cwd, "git", "import");
  return { cwd, logPath, command };
}
async function reviewOne(cwd: string) {
  await write(cwd, "records/one.md", markdown("one"));
  await snapshot(cwd);
  return dx(cwd, "review");
}

test("jex receives questions and files and its output creates a passing verdict", async () => {
  const { cwd, logPath } = await fixture();
  const result = await reviewOne(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)[0]).toMatchObject({
    by: "process:jex/fake-model",
    p: [0.9],
    pass: true,
  });
  expect(rows(result.stdout)[0]?.reasons).toEqual({ q1: "because" });
  const call = decode(
    z.object({
      cwd: z.string(),
      args: z.array(z.string()),
      files: z.array(z.object({ path: z.string(), text: z.string() })),
    }),
    await Bun.file(logPath).text(),
  );
  expect(call.args.slice(0, 2)).toEqual(["questions.toml", "records/one.md"]);
  expect(call.files[0]?.text).toContain("schema = 1");
  expect(call.files[0]?.text).toContain('id = "q1"');
  expect(call.files[1]?.text).toContain('id: "one"');
  expect(await Bun.file(call.cwd).exists()).toBe(false);
});

test("jex exit 1 writes a failing verdict and dx exits 1", async () => {
  const { cwd } = await fixture({ exit: 1, output: response(0.2) });
  const result = await reviewOne(cwd);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout)[0]).toMatchObject({
    by: "process:jex/fake-model",
    p: [0.2],
    pass: false,
  });
});

test("jex unavailable and undetermined responses do not write verdicts", async () => {
  const cases = [
    { exit: 3, output: response(), expected: 3 },
    { exit: 4, output: response(), expected: 4 },
    {
      exit: 0,
      output: JSON.stringify({ model: { na: true, why: "unavailable" }, bits: [] }),
      expected: 4,
    },
    { exit: 0, output: JSON.stringify({ model: "fake", bits: [] }), expected: 4 },
  ];
  for (const entry of cases) {
    const { cwd } = await fixture(entry);
    const result = await reviewOne(cwd);
    expect(result.exit, result.stderr).toBe(entry.expected);
    expect(await Bun.file(`${cwd}/verdicts/one.json`).exists()).toBe(false);
  }
}, 60000);

test("nine questions refuse before invoking jex", async () => {
  const { cwd, logPath } = await fixture({ criteria: 9 });
  const result = await reviewOne(cwd);
  expect(result.exit).toBe(4);
  expect(result.stderr).toContain("jex の問いは 8 つまで");
  expect(await Bun.file(logPath).exists()).toBe(false);
  expect(await Bun.file(`${cwd}/verdicts/one.json`).exists()).toBe(false);
});

test("content-bearing evidence is passed by path and contentless evidence is omitted", async () => {
  const { logPath, command } = await fixture();
  const { runJex } = await import("../src/commands/review.ts");
  const evidence: Evidence[] = [
    { locator: "evidence.txt", status: "supplied", content: "linked text" },
    { locator: "missing.md", status: "missing" },
  ];
  const result = await runJex(
    command,
    "records/one.md",
    "record",
    [{ id: "q1", question: "Question?" }],
    evidence,
  );
  expect(result.isOk()).toBe(true);
  const call = decode(
    z.object({
      args: z.array(z.string()),
      files: z.array(z.object({ path: z.string(), text: z.string() })),
    }),
    await Bun.file(logPath).text(),
  );
  expect(call.args).toContain("evidence.txt");
  expect(call.args).not.toContain("missing.md");
  expect(call.files.find((file) => file.path === "evidence.txt")?.text).toBe("linked text");
});
