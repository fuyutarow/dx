#!/usr/bin/env bun
import { parseInvocation, type Invocation } from "./cli.ts";
import { readConfig } from "./config.ts";
import { attemptAsync, undetermined } from "./errors.ts";
import { revision, root, show } from "./repository.ts";
import { responseSchema } from "./worker.ts";
import { land } from "./commands/land.ts";

export async function execute(
  invocation: Invocation,
  cwd = process.cwd(),
): Promise<{ exit: number; stdout: string; stderr: string }> {
  const started = performance.now();
  const repo = await root(cwd);
  const head = await revision(repo, invocation.command === "schema" ? "@" : invocation.rev);
  const config = readConfig(await show(repo, head, "dx.toml", 120000));
  if (invocation.command === "land")
    return land(repo, head, config, (base, rev) =>
      execute({ command: "check", base, rev, list: false }, repo),
    );
  const base =
    invocation.command === "check"
      ? await revision(repo, invocation.base ?? `${config.repo.branch}@${config.repo.remote}`)
      : undefined;
  const milliseconds = config.limits.check_seconds * 1000 - (performance.now() - started);
  if (milliseconds <= 0) return undetermined("limits.check_seconds exceeded");
  const signal = AbortSignal.timeout(Math.ceil(milliseconds));
  const child = Bun.spawn({
    cmd: [process.execPath, "--no-install", `${import.meta.dir}/worker.ts`],
    cwd: repo,
    stdin: new Blob([JSON.stringify({ cwd: repo, head, base, config, invocation })]),
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
    env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (signal.aborted) return undetermined("limits.check_seconds exceeded");
  if (exit !== 0)
    return undetermined(
      stderr.trim() === ""
        ? `policy process exited ${exit}`
        : stderr.trim().replace(/^UNDETERMINED:/u, ""),
    );
  // Buffer the entire response. Inability to decide must leave stdout empty (C4).
  return responseSchema.parse(JSON.parse(stdout));
}
if (import.meta.main) {
  const invocation = parseInvocation(Bun.argv.slice(2));
  if (invocation !== undefined) {
    const result = await attemptAsync(() => execute(invocation));
    if (result.isErr()) {
      process.stderr.write(`UNDETERMINED:${result.error.replaceAll("\n", " ")}\n`);
      process.exitCode = 4;
    } else {
      process.stdout.write(result.value.stdout);
      process.stderr.write(result.value.stderr);
      process.exitCode = result.value.exit;
    }
  }
}
