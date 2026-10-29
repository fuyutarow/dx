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
import { admit } from "../../src/commands/admit.ts";
import { readConfig } from "../../src/config.ts";
import { CURRENT } from "../../src/layout.ts";
import { execute } from "../../src/main.ts";
import { pushOutcome, run } from "../../src/admit/process.ts";

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
      const result = await dx(cwd, "admit");
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
    await write(cwd, "semlint.toml", 'edition = 1\n[repo]\nname="fixture"\n');
    await snapshot(cwd);
    const result = await dx(cwd, "admit");
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
    const result = await dx(cwd, "admit", head);
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
      await admit(
        cwd,
        head,
        value(readConfig('edition = 1\n[repo]\nname="fixture"', CURRENT)),
        async (actualBase, rev) => {
          expect(actualBase).toBe(base);
          const checked = value(
            await execute({ command: "check", base: actualBase, rev, list: false }, cwd),
          );
          expect(checked.exit).toBe(0);
          expect((await dx(other, "admit", winner)).exit).toBe(0);
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
    const result = await dx(cwd, "admit");
    expect(result.exit).toBe(3);
    expect(result.stderr).toBe("REMOTE_UNAVAILABLE\n");
    expect(result.stdout).toBe("");
    const invalid = await dx(cwd, "admit", "not-a-revision");
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
    const result = await dx(cwd, "admit", head);
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
    const result = await dx(cwd, "admit", head);
    expect(result.exit, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "WARNING: push succeeded; jj remote-tracking bookmark could not be updated\n",
    );
    expect(result.stderr).not.toContain("local bookmark could not be updated");
    expect(decode(fieldsSchema, result.stdout).commit).toBe(head);
    expect(await tip(remote)).toBe(head);
    expect(await jj(cwd, "log", "--no-graph", "-r", "alpha", "-T", "commit_id")).toBe(head);
    // Git 2.56 updates the tracking ref during push, even when the hook changes its URL.
    // Older Git leaves it at base. Failed follow-up fetch promises a warning, not a stale ref.
    expect([base, head]).toContain(
      await jj(cwd, "log", "--no-graph", "-r", "alpha@origin", "-T", "commit_id"),
    );
  },
  timeout,
);

test(
  "land rejects force and extra arguments with exit 2",
  async () => {
    const { cwd } = await fixture();
    for (const args of [["--force"], ["@", "@-"]])
      expect((await dx(cwd, "admit", ...args)).exit).toBe(2);
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
      const script = `import { run } from ${JSON.stringify(join(import.meta.dir, "../../src/admit/process.ts"))}; await run(process.cwd(), [process.execPath, "-e", "await Bun.sleep(2200)"], {remote:"origin", phase:${JSON.stringify(phase)}});`;
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
    const result = await dx(cwd, "admit", head);
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
    await write(cwd, "semlint.toml", 'edition = 1\n[repo]\nname="fixture"\nremote="upstream"\nbranch="release"\n');
    const head = await snapshot(cwd);
    const result = await dx(cwd, "admit", head);
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

for (const hookName of ["pre-push", "pre-receive"])
  test(
    `failing ${hookName} returns PUSH_REJECTED and the reason`,
    async () => {
      const { cwd, remote, base } = await fixture();
      await write(cwd, "records/rejected.md", markdown("rejected"));
      const head = await snapshot(cwd);
      const hook = join(hookName === "pre-push" ? join(cwd, ".git") : remote, "hooks", hookName);
      await Bun.write(
        hook,
        `#!${process.execPath}\nconsole.error("Git LFS upload failed: (missing) fixture.pointer"); process.exit(1);\n`,
      );
      await chmod(hook, 0o755);
      const result = await dx(cwd, "admit", head);
      expect(result.exit, result.stderr).toBe(1);
      expect(result.stderr).toContain("PUSH_REJECTED\n");
      expect(result.stderr).toContain("Git LFS upload failed: (missing) fixture.pointer");
      expect(result.stdout).toBe("");
      expect(await tip(remote)).toBe(base);
    },
    timeout,
  );

// A real Git subprocess performs the push; the shim loses only its response.
async function ambiguousGit(cwd: string, remote: string, mode: string) {
  const binary = Bun.which("git");
  expect(binary).not.toBeNull();
  const directory = join(cwd, ".git", "transport");
  await mkdir(directory);
  const path = join(directory, "git");
  await Bun.write(
    path,
    `#!${process.execPath}
import { renameSync } from "node:fs";
const args = process.argv.slice(2);
${mode === "ancestry-error" ? 'if (args.includes("merge-base")) process.exit(2);' : ""}
const pushing = args.includes("push");
const child = Bun.spawn([${JSON.stringify(binary)}, ...args], {stdin:"inherit", stdout: pushing ? "ignore" : "inherit", stderr: pushing ? "ignore" : "inherit"});
const exit = await child.exited;
if (pushing) {
  ${mode === "unavailable" ? `renameSync(${JSON.stringify(remote)}, ${JSON.stringify(`${remote}.offline`)});` : ""}
  ${
    mode === "descendant"
      ? `
  const git = (...args) => {
    const result = Bun.spawnSync([${JSON.stringify(binary)}, "--git-dir=" + ${JSON.stringify(remote)}, ...args], {env: {...process.env, GIT_AUTHOR_NAME:"DX", GIT_AUTHOR_EMAIL:"dx@example.test", GIT_COMMITTER_NAME:"DX", GIT_COMMITTER_EMAIL:"dx@example.test"}});
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  const parent = git("rev-parse", "refs/heads/alpha");
  const next = git("commit-tree", git("rev-parse", parent + "^{tree}"), "-p", parent, "-m", "later writer");
  git("update-ref", "refs/heads/alpha", next, parent);
  `
      : ""
  }
  console.error("connection lost after sending");
  process.exit(1);
}
process.exit(exit);
`,
  );
  await chmod(path, 0o755);
  return `${directory}:${process.env.PATH}`;
}

for (const mode of ["accepted", "descendant", "race", "unavailable", "ancestry-error"])
  test(
    `ambiguous push is resolved by fetch (${mode})`,
    async () => {
      const { cwd, remote, base } = await fixture();
      await write(cwd, "records/ambiguous.md", markdown("ambiguous"));
      const head = await snapshot(cwd);
      if (mode === "race") {
        // Reject without a recognizable porcelain/diagnostic response at the client.
        const hook = join(remote, "hooks", "pre-receive");
        await Bun.write(hook, `#!${process.execPath}\nprocess.exit(1);\n`);
        await chmod(hook, 0o755);
      }
      const path = await ambiguousGit(cwd, remote, mode);
      const result = await processRun(cwd, [
        "env",
        `PATH=${path}`,
        process.execPath,
        join(import.meta.dir, "../../src/main.ts"),
          "admit",
        head,
      ]);
      const accepted = ["accepted", "descendant"].includes(mode);
      expect(result.exit, result.stderr).toBe(accepted ? 0 : 3);
      if (accepted) {
        expect(decode(fieldsSchema, result.stdout).commit).toBe(head);
        await git(remote, "merge-base", "--is-ancestor", head, await tip(remote));
        expect((await tip(remote)) === head).toBe(mode === "accepted");
      } else {
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(mode === "race" ? "RACE\n" : "RESULT_UNKNOWN\n");
        if (mode === "race") expect(await tip(remote)).toBe(base);
      }
    },
    timeout,
  );

test("remote ref locks and lease failures are RACE", () => {
  for (const stderr of [
    "remote: error: failed to lock refs/heads/alpha",
    "remote: error: cannot lock ref 'refs/heads/alpha'",
    "[rejected] (stale info)",
  ])
    expect(pushOutcome({ stdout: "", stderr, exit: 1, timedOut: false }, "refs/heads/alpha")).toBe(
      "RACE",
    );
});

test("unreachable HTTPS and SSH remotes are REMOTE_UNAVAILABLE", () => {
  for (const stderr of [
    "fatal: unable to access 'https://example.test/repo': Failed to connect to example.test port 443",
    "fatal: Could not read from remote repository.",
    "git@example.test: Permission denied (publickey).",
  ])
    expect(
      pushOutcome({ stdout: "", stderr, exit: 128, timedOut: false }, "refs/heads/alpha"),
    ).toBe("REMOTE_UNAVAILABLE");
});

test("eight concurrent writers: every attempt agrees with remote ancestry", async () => {
  const { cwd, remote } = await fixture();
  const writers = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const writer = join(cwd, ".git", `writer-${i}`);
      await cloneRepo(cwd, remote, writer);
      await jj(writer, "new", "alpha@origin");
      // Exercise ambiguous responses as well as normal Git porcelain in the same race.
      const path = i % 2 === 0 ? await ambiguousGit(writer, remote, "accepted") : process.env.PATH;
      return { writer, i, path };
    }),
  );
  const attempts = [];
  for (let round = 0; round < 3; round++) {
    const results = await Promise.all(
      writers.map(async ({ writer, i, path }) => {
        await jj(writer, "git", "fetch", "--remote", "origin");
        await jj(writer, "new", "alpha@origin");
        await write(writer, `records/writer-${i}-${round}.md`, markdown(`writer-${i}-${round}`));
        const head = await snapshot(writer);
        const result = await processRun(writer, [
          "env",
          `PATH=${path}`,
          process.execPath,
          join(import.meta.dir, "../../src/main.ts"),
        "admit",
          head,
        ]);
        return Object.assign({ head }, result);
      }),
    );
    const remoteHead = await tip(remote);
    for (const result of results) {
      attempts.push(await reconcile(remote, remoteHead, result));
    }
  }
  console.error(
    `concurrent land reconciliation: ${JSON.stringify({
      writers: 8,
      attempts: attempts.length,
      accepted: attempts.filter((a) => a.accepted).length,
      exits: attempts.reduce<Record<string, number>>((counts, a) => {
        const key = `${a.exit}:${a.code}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      resolvableUnknown: 0,
      mismatches: 0,
    })}`,
  );
}, 120000);

async function reconcile(
  remote: string,
  remoteHead: string,
  result: { head: string; exit: number; stdout: string; stderr: string },
) {
  const ancestry = await processRun(remote, [
    "git",
    "merge-base",
    "--is-ancestor",
    result.head,
    remoteHead,
  ]);
  // A rejected commit may never have reached the bare object store (exit 128).
  const accepted = ancestry.exit === 0;
  expect(result.exit === 0, JSON.stringify(result)).toBe(accepted);
  if (accepted) expect(decode(fieldsSchema, result.stdout).commit).toBe(result.head);
  else expect(result.stderr).toMatch(/RACE|NOT_FAST_FORWARD/u);
  expect(result.stderr).not.toContain("RESULT_UNKNOWN");
  return {
    exit: result.exit,
    accepted,
    code: accepted ? "accepted" : result.stderr.split("\n")[0],
  };
}
