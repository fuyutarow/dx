#!/usr/bin/env bun
import { attemptAsync, undetermined } from "./errors.ts";
import { ok, safeTry, type Result } from "neverthrow";
import { parseInvocation, type Invocation } from "./cli.ts";
import { readConfig } from "./config.ts";

import { revision, root, show } from "./repository.ts";
import { loadTypes } from "./policy.ts";
import { isolationFindings, readSnapshot, ruleFiles, snapshotCache } from "./collection.ts";
import { review } from "./commands/review.ts";
import { check } from "./commands/check.ts";
import { listRecords } from "./commands/ls.ts";
import { view } from "./commands/view.ts";
import { stableJson } from "./formats.ts";
import { land } from "./commands/land.ts";
import { version } from "../package.json" with { type: "json" };

export async function execute(
  invocation: Invocation,
  cwd = process.cwd(),
): Promise<Result<{ exit: number; stdout: string; stderr: string }, string>> {
  return safeTry(async function* () {
    const repo = yield* await root(cwd);
    const head = yield* await revision(repo, invocation.rev);
    const config = yield* readConfig(yield* await show(repo, head, "dx.toml", 120000));
    if (invocation.command === "land")
      return ok(
        yield* await land(repo, head, config, (base, rev) =>
          execute({ command: "check", base, rev, list: false }, repo),
        ),
      );
    const base =
      invocation.command === "check" || invocation.command === "review"
        ? yield* await revision(
            repo,
            invocation.base ?? `${config.repo.branch}@${config.repo.remote}`,
          )
        : undefined;
    // Repository I/O keeps its per-operation bound; callers bound total execution.
    const ms = 120000;
    const cache = snapshotCache(repo, ms);
    const types = yield* await loadTypes(yield* await ruleFiles(repo, head, ms, cache.reader));
    const current = yield* await readSnapshot(repo, head, config, types, ms, cache);
    if (
      invocation.command !== "check" &&
      invocation.command !== "review" &&
      current.findings.some((finding) => finding.check === "format")
    )
      return undetermined("record format could not be read; run dx check for findings");
    if (invocation.command === "review" && base !== undefined) {
      const previous = yield* await readSnapshot(repo, base, config, types, ms, cache);
      const isolation = yield* await isolationFindings(
        repo,
        base,
        head,
        config,
        types,
        ms,
        cache.reader,
      );
      return review(repo, previous, current, types, config, isolation);
    }
    if (invocation.command === "check" && base !== undefined) {
      const previous = yield* await readSnapshot(repo, base, config, types, ms, cache);
      const findings = yield* await check(
        previous,
        current,
        types,
        yield* await isolationFindings(repo, base, head, config, types, ms, cache.reader),
      );
      const count = findings.filter((f) => f.new).length;
      return ok({
        exit: count > 0 ? 1 : 0,
        stdout:
          findings.map((finding) => stableJson(finding)).join("\n") +
          (findings.length > 0 ? "\n" : ""),
        stderr: `${count > 0 ? "FINDINGS: " : ""}新しい finding ${count} 件 / 既存 ${findings.length - count} 件\n`,
      });
    }
    const viewName = invocation.list ? undefined : invocation.name;
    const rows =
      invocation.command === "ls"
        ? listRecords(current)
        : yield* await view(types, current, viewName);
    return ok({
      exit: 0,
      stdout: rows.map((row) => stableJson(row)).join("\n") + (rows.length > 0 ? "\n" : ""),
      stderr: "",
    });
  });
}
async function main(): Promise<void> {
  const invocation = parseInvocation(Bun.argv.slice(2));
  if (invocation === undefined) return;
  if (invocation.command === "version") {
    process.stdout.write(`dx ${version}\n`);
    process.exitCode = 0;
    return;
  }
  const result = await attemptAsync(() => execute(invocation)).andThen((value) => value);
  if (result.isErr()) {
    process.stderr.write(`UNDETERMINED:${result.error.replaceAll("\n", " ")}\n`);
    process.exitCode = 4;
    return;
  }
  process.stdout.write(result.value.stdout);
  process.stderr.write(result.value.stderr);
  process.exitCode = result.value.exit;
}
if (import.meta.main) await main();
