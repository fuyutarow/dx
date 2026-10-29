import { expect, test } from "bun:test";
import { join } from "node:path";
import { ok } from "neverthrow";
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
  const config = configSchema.parse({
    repo: { name: "fixture", branch: "release", remote: "upstream" },
  });
  return { cwd, base, remote, config };
}

test("non-fast-forward reports the compared ref, commits and rebase", async () => {
  const { cwd, base, remote, config } = await fixture();
  await jj(cwd, "new", "root()");
  await write(cwd, "unrelated.txt", "unrelated\n");
  const head = await snapshot(cwd);
  const result = value(
    await admit(cwd, head, config, async () => expect.unreachable("check called")),
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
    await admit(cwd, head, config, async (actualBase, actualHead) => {
      expect(actualBase).toBe(base);
      expect(actualHead).toBe(head);
      return ok({ exit: 0, stdout: "", stderr: "" });
    }),
  );
  expect(result.exit, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    v: 1,
    commit: head,
    base,
    branch: "release",
    remote: "upstream",
  });
  expect(await git(remote, "rev-parse", "refs/heads/release")).toBe(head);
}, 60000);
