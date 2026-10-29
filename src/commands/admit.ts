import { ok, safeTry, type Result } from "neverthrow";
import type { Config } from "../config.ts";
import { attemptAsync, undetermined } from "../errors.ts";
import { jj, revision } from "../repository.ts";
import { pushOutcome, pushRejectionDetails, run } from "../admit/process.ts";

type Output = { exit: number; stdout: string; stderr: string };
const refused = (exit: number, code: string): Output => ({ exit, stdout: "", stderr: `${code}\n` });

export async function admit(
  cwd: string,
  head: string,
  config: Config,
  check: (base: string, head: string) => Promise<Result<Output, string>>,
) {
  return safeTry(async function* () {
    const { branch, remote } = config.repo;
    const ref = `refs/heads/${branch}`;
    const gitDir = (yield* await jj(cwd, ["git", "root"])).trim();
    const git = ["git", `--git-dir=${gitDir}`];
    const valid = await run(cwd, [...git, "check-ref-format", ref]);
    if (valid.exit !== 0) return undetermined("invalid repo.branch");
    // Resolve the fetch URL, deliberately ignoring pushurl: the fetched repository is the authority.
    const url = await run(cwd, [...git, "remote", "get-url", "--", remote]);
    if (url.exit !== 0) return ok(refused(3, "REMOTE_UNAVAILABLE"));
    const fetch = await run(
      cwd,
      [
        "jj",
        "--ignore-working-copy",
        "--no-pager",
        "--color=never",
        "git",
        "fetch",
        "--remote",
        `exact:${remote}`,
      ],
      { remote, phase: "fetch" },
    );
    if (fetch.exit !== 0 || fetch.timedOut) return ok(refused(3, "REMOTE_UNAVAILABLE"));
    const base = yield* await revision(cwd, `${JSON.stringify(branch)}@${JSON.stringify(remote)}`);
    const ancestor = yield* await jj(cwd, [
      "log",
      "--no-graph",
      "-r",
      `${base} & ::${head}`,
      "-T",
      "commit_id",
    ]);
    if (ancestor.trim() !== base)
      return ok({
        exit: 1,
        stdout: "",
        stderr: `NOT_FAST_FORWARD\ncompared: ${branch}@${remote} = ${base}; ${head} is not its descendant\nnext: jj git fetch --remote ${remote} && jj rebase -b ${head} -d '${branch}@${remote}'\n`,
      });
    const checked = yield* await check(base, head);
    if (checked.exit !== 0) return ok(checked);
    const push = await run(
      cwd,
      [
        ...git,
        "push",
        "--porcelain",
        "--no-follow-tags",
        "--recurse-submodules=no",
        `--force-with-lease=${ref}:${base}`,
        "--",
        url.stdout.trim(),
        `${head}:${ref}`,
      ],
      { remote, phase: "push" },
    );
    let failure = pushOutcome(push, ref);
    // An ambiguous transport result is not evidence of rejection. Refresh the authority
    // and test reachability of the exact attempted commit, including a later descendant.
    let resolved = false;
    if (failure === "RESULT_UNKNOWN") {
      failure = await resolveUnknown(cwd, head, branch, remote, git);
      resolved = failure === undefined;
    }
    if (failure !== undefined)
      return ok({
        ...refused(failure === "PUSH_REJECTED" ? 1 : 3, failure),
        stdout: checked.stdout,
        stderr: `${failure}\n${failure === "PUSH_REJECTED" ? `${pushRejectionDetails(push.stderr).join("\n")}\n` : ""}${checked.stderr}`,
      });
    // The remote has accepted head. Local bookkeeping cannot revoke that acceptance (I-01).
    // Push uses a URL, so Git does not update the named remote's tracking ref for import.
    const sync = resolved
      ? { exit: 0, timedOut: false }
      : await run(
          cwd,
          [
            "jj",
            "--ignore-working-copy",
            "--no-pager",
            "--color=never",
            "git",
            "fetch",
            "--remote",
            `exact:${remote}`,
            "--branch",
            `exact:${branch}`,
          ],
          { remote, phase: "fetch" },
        );
    const bookmark = await attemptAsync(() =>
      jj(cwd, ["bookmark", "set", "--allow-backwards", "--revision", head, "--", branch]),
    ).andThen((value) => value);
    return ok({
      exit: 0,
      stdout: `${JSON.stringify({ v: 1, commit: head, base, branch, remote })}\n`,
      stderr:
        checked.stderr +
        (sync.exit !== 0 || sync.timedOut
          ? "WARNING: push succeeded; jj remote-tracking bookmark could not be updated\n"
          : "") +
        (bookmark.isErr() ? "WARNING: push succeeded; local bookmark could not be updated\n" : ""),
    });
  });
}

async function resolveUnknown(
  cwd: string,
  head: string,
  branch: string,
  remote: string,
  git: string[],
): Promise<string | undefined> {
  const refreshed = await run(
    cwd,
    [
      "jj",
      "--ignore-working-copy",
      "--no-pager",
      "--color=never",
      "git",
      "fetch",
      "--remote",
      `exact:${remote}`,
      "--branch",
      `exact:${branch}`,
    ],
    { remote, phase: "fetch" },
  );
  if (refreshed.exit !== 0 || refreshed.timedOut) return "RESULT_UNKNOWN";
  const remoteHead = await revision(cwd, `${JSON.stringify(branch)}@${JSON.stringify(remote)}`);
  if (remoteHead.isErr()) return "RESULT_UNKNOWN";
  const ancestry = await run(cwd, [...git, "merge-base", "--is-ancestor", head, remoteHead.value]);
  if (ancestry.timedOut) return "RESULT_UNKNOWN";
  if (ancestry.exit === 0) return undefined;
  return ancestry.exit === 1 ? "RACE" : "RESULT_UNKNOWN";
}
