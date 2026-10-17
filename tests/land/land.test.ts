import {
  decode,
  value,
  advance,
  dx,
  jj,
  markdown,
  processRun,
  repo,
  rows,
  snapshot,
  write,
} from "../helpers.ts";
import { fieldsSchema } from "../../src/model.ts";
import { ok } from "neverthrow";

import { test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { land } from "../../src/commands/land.ts";
import { readConfig } from "../../src/config.ts";
import { execute } from "../../src/main.ts";
import { pushOutcome, run } from "../../src/land/process.ts";

const timeout = 60000;
const originalConfigHome = process.env.XDG_CONFIG_HOME;
let configHome: string;
beforeEach(async () => {
  configHome = await mkdtemp(join(tmpdir(), "dx-land-config-"));
  process.env.XDG_CONFIG_HOME = configHome;
});
afterEach(async () => {
  if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalConfigHome;
  await rm(configHome, { recursive: true, force: true });
});
async function cloneRepo(cwd: string, remote: string, destination: string, colocate = true) {
  const result = await processRun(cwd, [
    "env",
    "JJ_USER=DX Test",
    "JJ_EMAIL=dx@example.test",
    "jj",
    "git",
    "clone",
    colocate ? "--colocate" : "--no-colocate",
    remote,
    destination,
  ]);
  expect(result.exit, result.stderr).toBe(0);
}
async function git(cwd: string, ...args: string[]) {
  const result = await processRun(cwd, ["git", ...args]);
  expect(result.exit, result.stderr).toBe(0);
  return result.stdout.trim();
}
async function fixture(colocate = true) {
  const { cwd, base } = await repo();
  // Keep infrastructure outside the revision's policy tree, but inside the cleaned fixture dir.
  const remote = join(cwd, ".git", "bare.git");
  await git(cwd, "init", "--bare", remote);
  await jj(cwd, "git", "remote", "add", "origin", remote);
  await git(cwd, "push", "origin", `${base}:refs/heads/alpha`);
  await jj(cwd, "git", "fetch", "--remote", "origin");
  if (colocate) return { cwd, remote, base };
  const clone = join(cwd, ".git", "noncolocated");
  await cloneRepo(cwd, remote, clone, false);
  await jj(clone, "new", "alpha@origin");
  return { cwd: clone, remote, base };
}
const tip = (remote: string) => git(remote, "rev-parse", "refs/heads/alpha");

for (const colocate of [true, false])
  test(
    `land I-01/I-08 and receipt (colocate=${colocate})`,
    async () => {
      const { cwd, remote, base } = await fixture(colocate);
      await write(cwd, "records/a.md", markdown("a"));
      const head = await snapshot(cwd);
      const result = await dx(cwd, "land");
      expect(result.exit, result.stderr).toBe(0);
      expect(decode(fieldsSchema, result.stdout)).toEqual({
        v: 1,
        commit: head,
        base,
        branch: "alpha",
        remote: "origin",
      });
      expect(await tip(remote)).toBe(head);
      expect(await jj(cwd, "log", "--no-graph", "-r", "alpha@origin", "-T", "commit_id")).toBe(
        head,
      );
      expect(await jj(cwd, "log", "--no-graph", "-r", "alpha", "-T", "commit_id")).toBe(head);
      await git(remote, "merge-base", "--is-ancestor", base, head);
    },
    timeout,
  );

test(
  "non-fast-forward exits 1 without changing remote",
  async () => {
    const { cwd, remote, base } = await fixture();
    await jj(cwd, "new", "root()");
    await write(cwd, "dx.toml", '[repo]\nname="fixture"\n');
    await snapshot(cwd);
    const result = await dx(cwd, "land");
    expect(result.exit).toBe(1);
    expect(result.stderr).toContain("NOT_FAST_FORWARD");
    expect(result.stdout).toBe("");
    expect(await tip(remote)).toBe(base);
  },
  timeout,
);

test(
  "check rejection emits every finding and never pushes",
  async () => {
    const { cwd, remote, base } = await fixture();
    await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
    await write(cwd, "records/b.md", markdown("b", "bad: true\n"));
    const head = await snapshot(cwd);
    const preview = await dx(cwd, "check", "--base", base, head);
    const result = await dx(cwd, "land", head);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe(preview.stdout);
    expect(rows(result.stdout)).toHaveLength(2);
    expect(await tip(remote)).toBe(base);
  },
  timeout,
);

test(
  "a second clone lands after check: explicit lease exits 3/RACE and preserves winner",
  async () => {
    const { cwd, remote, base } = await fixture();
    const other = join(cwd, ".git", "other");
    await cloneRepo(cwd, remote, other);
    await jj(other, "new", "alpha@origin");
    await write(other, "records/winner.md", markdown("winner"));
    const winner = await snapshot(other);
    await write(cwd, "records/loser.md", markdown("loser"));
    const head = await snapshot(cwd);
    const result = value(
      await land(
        cwd,
        head,
        value(readConfig('[repo]\nname="fixture"')),
        async (actualBase, rev) => {
          expect(actualBase).toBe(base);
          const checked = value(
            await execute({ command: "check", base: actualBase, rev, list: false }, cwd),
          );
          expect(checked.exit).toBe(0);
          expect((await dx(other, "land", winner)).exit).toBe(0);
          return ok(checked);
        },
      ),
    );
    expect(result.exit).toBe(3);
    expect(result.stderr).toContain("RACE\n");
    expect(result.stdout).toBe("");
    expect(await tip(remote)).toBe(winner);
  },
  timeout,
);

test(
  "missing remote exits 3/REMOTE_UNAVAILABLE; nonexistent REV exits 4",
  async () => {
    const { cwd, remote } = await fixture();
    await rm(remote, { recursive: true });
    const result = await dx(cwd, "land");
    expect(result.exit).toBe(3);
    expect(result.stderr).toBe("REMOTE_UNAVAILABLE\n");
    expect(result.stdout).toBe("");
    const invalid = await dx(cwd, "land", "not-a-revision");
    expect(invalid.exit).toBe(4);
    expect(invalid.stdout).toBe("");
  },
  timeout,
);

test(
  "bookmark failure after push still returns receipt and warning",
  async () => {
    const { cwd, remote } = await fixture();
    await write(cwd, "records/a.md", markdown("a"));
    const head = await snapshot(cwd);
    // A git pre-push hook sabotages only the later bookmark command's jj repository lookup.
    const hooks = join(cwd, ".git", "hooks");
    await mkdir(hooks, { recursive: true });
    const hook = join(hooks, "pre-push");
    await Bun.write(
      hook,
      `#!${process.execPath}\nimport { renameSync } from "node:fs";\nrenameSync(${JSON.stringify(join(cwd, ".jj"))}, ${JSON.stringify(join(cwd, ".jj-disabled"))});\n`,
    );
    await chmod(hook, 0o755);
    const result = await dx(cwd, "land", head);
    expect(result.exit, result.stderr).toBe(0);
    expect(result.stderr).toContain("WARNING:");
    expect(decode(fieldsSchema, result.stdout).commit).toBe(head);
    expect(await tip(remote)).toBe(head);
  },
  timeout,
);

test(
  "remote-tracking sync failure after push still returns receipt and updates local bookmark",
  async () => {
    const { cwd, remote, base } = await fixture();
    await write(cwd, "records/a.md", markdown("a"));
    const head = await snapshot(cwd);
    // Push already resolved its URL; only the subsequent fetch uses this changed URL.
    const hooks = join(cwd, ".git", "hooks");
    await mkdir(hooks, { recursive: true });
    const hook = join(hooks, "pre-push");
    await Bun.write(
      hook,
      `#!${process.execPath}\nconst child = Bun.spawn(["git", "--git-dir=${join(cwd, ".git")}", "remote", "set-url", "origin", ${JSON.stringify(join(cwd, ".git", "missing.git"))}], {stdout:"ignore", stderr:"inherit"}); process.exit(await child.exited);\n`,
    );
    await chmod(hook, 0o755);
    const result = await dx(cwd, "land", head);
    expect(result.exit, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "WARNING: push succeeded; jj remote-tracking bookmark could not be updated\n",
    );
    expect(result.stderr).not.toContain("local bookmark could not be updated");
    expect(decode(fieldsSchema, result.stdout).commit).toBe(head);
    expect(await tip(remote)).toBe(head);
    expect(await jj(cwd, "log", "--no-graph", "-r", "alpha", "-T", "commit_id")).toBe(head);
    expect(await jj(cwd, "log", "--no-graph", "-r", "alpha@origin", "-T", "commit_id")).toBe(base);
  },
  timeout,
);

test(
  "land rejects force and extra arguments with exit 2",
  async () => {
    const { cwd } = await fixture();
    for (const args of [["--force"], ["@", "@-"]])
      expect((await dx(cwd, "land", ...args)).exit).toBe(2);
  },
  timeout,
);

test("subprocess deadline and unknown push result fail closed", async () => {
  const timed = await run(
    import.meta.dir,
    [process.execPath, "-e", "await Bun.sleep(10000)"],
    undefined,
    20,
  );
  expect(timed.timedOut).toBe(true);
  expect(pushOutcome(timed, "refs/heads/alpha")).toBe("REMOTE_UNAVAILABLE");
  for (const exit of [0, 1, -1])
    expect(
      pushOutcome(
        { stdout: "", stderr: "connection lost after sending", exit, timedOut: false },
        "refs/heads/alpha",
      ),
    ).toBe("RESULT_UNKNOWN");
});

test(
  "fetch and push each emit one waiting line after two seconds",
  async () => {
    for (const phase of ["fetch", "push"]) {
      const script = `import { run } from ${JSON.stringify(join(import.meta.dir, "../../src/land/process.ts"))}; await run(process.cwd(), [process.execPath, "-e", "await Bun.sleep(2200)"], {remote:"origin", phase:${JSON.stringify(phase)}});`;
      const result = await processRun(import.meta.dir, [process.execPath, "-e", script]);
      expect(result.exit).toBe(0);
      expect(result.stderr).toBe(`dx: waiting for origin (${phase})…\n`);
    }
  },
  timeout,
);

test(
  "explicit REV stays pinned even with a later working copy",
  async () => {
    const { cwd, remote } = await fixture();
    await write(cwd, "records/a.md", markdown("a"));
    const head = await advance(cwd);
    await write(cwd, "records/b.md", markdown("b", "bad: true\n"));
    await snapshot(cwd);
    const result = await dx(cwd, "land", head);
    expect(result.exit, result.stderr).toBe(0);
    expect(await tip(remote)).toBe(head);
  },
  timeout,
);

test(
  "configured branch/remote use fetch authority even with a different pushurl",
  async () => {
    const { cwd, remote, base } = await fixture();
    await git(remote, "update-ref", "refs/heads/release", base);
    await jj(cwd, "git", "remote", "rename", "origin", "upstream");
    await git(cwd, "remote", "set-url", "--push", "upstream", join(cwd, ".git", "missing.git"));
    await write(cwd, "dx.toml", '[repo]\nname="fixture"\nremote="upstream"\nbranch="release"\n');
    const head = await snapshot(cwd);
    const result = await dx(cwd, "land", head);
    expect(result.exit, result.stderr).toBe(0);
    expect(decode(fieldsSchema, result.stdout)).toEqual({
      v: 1,
      commit: head,
      base,
      branch: "release",
      remote: "upstream",
    });
    expect(await git(remote, "rev-parse", "refs/heads/release")).toBe(head);
    expect(await jj(cwd, "log", "--no-graph", "-r", "release@upstream", "-T", "commit_id")).toBe(
      head,
    );
    expect(await tip(remote)).toBe(base);
  },
  timeout,
);

test(
  "deadline also closes pipes inherited by a transport subprocess",
  async () => {
    const start = performance.now();
    const child =
      'Bun.spawn([process.execPath, "-e", "await Bun.sleep(1200)"], {stdout:"inherit", stderr:"inherit"}); await Bun.sleep(10000);';
    const result = await run(import.meta.dir, [process.execPath, "-e", child], undefined, 100);
    expect(result.timedOut).toBe(true);
    expect(performance.now() - start).toBeLessThan(1000);
  },
  timeout,
);
