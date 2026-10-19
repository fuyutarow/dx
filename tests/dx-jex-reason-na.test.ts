import { expect, test } from "bun:test";
import { dx, markdown, repo, rows, snapshot, write, jj, spawn } from "./helpers.ts";

const rubric = (count: number) =>
  `rubric = "test/v1"\n${Array.from({ length: count }, (_, index) => `[[criteria]]\nbit = ${index}\nid = "q${index + 1}"\nquestion = "Question ${index + 1}?"\n`).join("\n")}`;

async function fixture(response: unknown, criteria: number) {
  const command = [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(JSON.stringify(response))})`,
  ];
  const { cwd } = await repo(
    { review: "file:verdicts/*.json" },
    `[review]\ncommand = ${JSON.stringify(command)}\n`,
  );
  await write(cwd, ".dx/rubrics/r.toml", rubric(criteria));
  await jj(cwd, "new", "-m", "review base");
  const cleanBase = await jj(cwd, "log", "--no-graph", "-r", "@-", "-T", "commit_id");
  await jj(cwd, "git", "remote", "add", "origin", cwd);
  const git = await spawn(["git", "update-ref", "refs/remotes/origin/alpha", cleanBase], { cwd });
  expect(git.exitCode).toBe(0);
  await jj(cwd, "git", "import");
  return cwd;
}

async function reviewOne(cwd: string) {
  await write(cwd, "records/one.md", markdown("one"));
  await snapshot(cwd);
  return dx(cwd, "review");
}

test("string and unavailable reasons produce a verdict with only string reasons", async () => {
  const cwd = await fixture(
    {
      model: "fake-model",
      bits: [
        { id: "q1", p: 0.9, reason: "supported by evidence" },
        { id: "q2", p: 0.8, reason: { na: true, why: "Jev gave no reason" } },
      ],
    },
    2,
  );
  const result = await reviewOne(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)[0]).toMatchObject({
    by: "process:jex/fake-model",
    p: [0.9, 0.8],
    pass: true,
    reasons: { q1: "supported by evidence" },
  });
});

test("all unavailable reasons omit the verdict reasons field", async () => {
  const cwd = await fixture(
    {
      model: "fake-model",
      bits: [{ id: "q1", p: 0.9, reason: { na: true, why: "Jev gave no reason" } }],
    },
    1,
  );
  const result = await reviewOne(cwd);
  expect(result.exit, result.stderr).toBe(0);
  expect(rows(result.stdout)[0]).not.toHaveProperty("reasons");
});
