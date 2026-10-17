import { ok } from "neverthrow";
import { attemptAsync, undetermined } from "../errors.ts";

export type ProcessResult = {
  stdout: string;
  stderr: string;
  exit: number;
  timedOut: boolean;
};

async function drain(stream: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const decoder = new TextDecoder();
  let text = "";
  // Cancellation closes our pipe even if an orphaned transport still holds its writing end.
  const drained = await attemptAsync(() =>
    stream.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          text += decoder.decode(chunk, { stream: true });
        },
      }),
      { signal },
    ),
  );
  if (drained.isErr() && !signal.aborted) return undetermined(drained.error);
  return ok(text + decoder.decode());
}

/** Drain both pipes while waiting; each external operation has its own 60s budget. */
export async function run(
  cwd: string,
  cmd: string[],
  operation?: { remote: string; phase: "fetch" | "push" },
  milliseconds = 60000,
): Promise<ProcessResult> {
  const signal = AbortSignal.timeout(milliseconds);
  const waiting =
    operation === undefined
      ? undefined
      : setTimeout(() => {
          process.stderr.write(`dx: waiting for ${operation.remote} (${operation.phase})…\n`);
        }, 2000);
  const result = await attemptAsync(async () => {
    const child = Bun.spawn({
      cmd,
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    });
    const [stdout, stderr, exit] = await Promise.all([
      drain(child.stdout, signal),
      drain(child.stderr, signal),
      child.exited,
    ]);
    if (stdout.isErr()) return undetermined(stdout.error);
    if (stderr.isErr()) return undetermined(stderr.error);
    return ok({ stdout: stdout.value, stderr: stderr.value, exit, timedOut: signal.aborted });
  }).andThen((value) => value);
  clearTimeout(waiting);
  return result.isOk()
    ? result.value
    : {
        stdout: "",
        stderr: result.error,
        exit: -1,
        timedOut: signal.aborted,
      };
}

/** Only positive protocol evidence permits a success receipt. */
export function pushOutcome(result: ProcessResult, ref: string): string | undefined {
  if (result.timedOut) return "REMOTE_UNAVAILABLE";
  const rows = result.stdout.split("\n").map((line) => line.split("\t"));
  const status = rows.find((row) => row[1]?.endsWith(`:${ref}`) === true);
  return result.exit === 0 && status !== undefined && [" ", "=", "*"].includes(status[0] ?? "")
    ? undefined
    : pushFailure(result);
}
function pushFailure(result: ProcessResult): string {
  const detail = `${result.stdout}\n${result.stderr}`;
  if (/(stale info|fetch first|cannot lock ref .*expected|is at .*but expected)/iu.test(detail))
    return "RACE";
  if (
    /(could not resolve|does not appear to be a git repository|connection refused|network is unreachable|no such remote)/iu.test(
      detail,
    )
  )
    return "REMOTE_UNAVAILABLE";
  return "RESULT_UNKNOWN";
}
