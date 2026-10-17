import { resolve } from "node:path";
import { undetermined } from "./errors.ts";

export async function jj(cwd: string, args: string[], milliseconds = 120000): Promise<string> {
  const signal = AbortSignal.timeout(Math.max(1, Math.ceil(milliseconds)));
  const child = Bun.spawn({
    cmd: [
      "jj",
      "--ignore-working-copy",
      "--at-operation=@",
      "--no-pager",
      "--color=never",
      ...args,
    ],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (signal.aborted) return undetermined("jj read timed out");
  if (exit !== 0) return undetermined(`jj: ${stderr.trim()}`);
  return stdout;
}
export async function root(cwd: string): Promise<string> {
  return resolve((await jj(cwd, ["root"])).trim());
}
export async function revision(cwd: string, rev: string): Promise<string> {
  const ids = (await jj(cwd, ["log", "--no-graph", "-r", rev, "-T", 'commit_id ++ "\\n"']))
    .trim()
    .split("\n");
  if (ids.length !== 1 || !/^[a-f0-9]{40,64}$/u.test(ids[0] ?? ""))
    return undetermined(`REV must resolve to one commit: ${rev}`);
  return ids[0] ?? undetermined(`missing REV: ${rev}`);
}
export async function paths(cwd: string, rev: string, ms: number): Promise<string[]> {
  const text = await jj(cwd, ["file", "list", "-r", rev, "-T", 'path ++ "\\0"'], ms);
  return text.split("\0").filter(Boolean).toSorted();
}
export async function show(cwd: string, rev: string, path: string, ms: number): Promise<string> {
  // Fileset literals preserve spaces, wildcard characters, colons and newlines.
  const metadata = await jj(
    cwd,
    [
      "file",
      "show",
      "-r",
      rev,
      "-T",
      'file_type ++ "\\0"',
      "--",
      `root-file:${JSON.stringify(path)}`,
    ],
    ms,
  );
  const separator = metadata.indexOf("\0");
  const kind = metadata.slice(0, separator);
  if (kind !== "file" && kind !== "executable-file")
    return undetermined(`unsupported or conflicted tree entry: ${path} (${metadata})`);
  return metadata.slice(separator + 1);
}
