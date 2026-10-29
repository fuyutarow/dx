import { expect, test } from "bun:test";
import { join } from "node:path";
import { ok } from "neverthrow";
import { jsonOf, z } from "../.preset/zod.ts";
import { admit } from "../src/commands/admit.ts";
import { configSchema } from "../src/config.ts";
import { jj, processRun, repo, snapshot, value, write } from "./helpers.ts";

async function git(cwd: string, ...args: string[]) {
  const result = await processRun(cwd, ["git", ...args]);
  expect(result.exit, result.stderr).toBe(0);
  return result.stdout.trim();
}

async function fixture() {
  const { cwd, base } = await repo();
  const remote = join(cwd, ".git", "remote.git");
  await git(cwd, "init", "--bare", remote);
  await jj(cwd, "git", "remote", "add", "upstream", remote);
  await git(cwd, "push", "upstream", `${base}:refs/heads/release`);
  const parsedConfig = configSchema.safeParse({
    repo: { name: "fixture", branch: "release", remote: "upstream" },
  });
  expect(parsedConfig.success).toBe(true);
  const config = parsedConfig.success
    ? parsedConfig.data
    : expect.unreachable(parsedConfig.error.message);
  return { cwd, base, remote, config };
}

test("non-fast-forward reports the compared ref, commits and rebase", async () => {
  const { cwd, base, remote, config } = await fixture();
  await jj(cwd, "new", "root()");
  await write(cwd, "unrelated.txt", "unrelated\n");
  const head = await snapshot(cwd);
  const result = value(
    await admit(cwd, head, config, () => Promise.resolve(expect.unreachable("check called"))),
  );
  expect(result.exit).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    `NOT_FAST_FORWARD\ncompared: release@upstream = ${base}; ${head} is not its descendant\nnext: jj git fetch --remote upstream && jj rebase -b ${head} -d 'release@upstream'\n`,
  );
  expect(await git(remote, "rev-parse", "refs/heads/release")).toBe(base);
}, 60000);

test("fast-forward still checks and pushes the head", async () => {
  const { cwd, base, remote, config } = await fixture();
  await write(cwd, "new.txt", "new\n");
  const head = await snapshot(cwd);
  const result = value(
    await admit(cwd, head, config, (actualBase, actualHead) => {
      expect(actualBase).toBe(base);
      expect(actualHead).toBe(head);
      return Promise.resolve(ok({ exit: 0, stdout: "", stderr: "" }));
    }),
  );
  expect(result.exit, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const parsedOutput = jsonOf(z.unknown()).safeParse(result.stdout);
  expect(parsedOutput.success).toBe(true);
  const output = parsedOutput.success
    ? parsedOutput.data
    : expect.unreachable(parsedOutput.error.message);
  expect(output).toEqual({
    v: 1,
    commit: head,
    base,
    branch: "release",
    remote: "upstream",
  });
  expect(await git(remote, "rev-parse", "refs/heads/release")).toBe(head);
}, 60000);
