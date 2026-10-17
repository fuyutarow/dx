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

interface TreeEntry {
  readonly path: string;
  readonly kind: string;
  readonly id: string;
}

/** One command's immutable revision data; nothing is written to the repository. */
export class RevisionReader {
  private readonly trees = new Map<string, readonly TreeEntry[]>();
  private readonly blobs = new Map<string, string>();
  private gitDirectory: string | undefined;

  constructor(
    private readonly cwd: string,
    private readonly ms: number,
  ) {}

  async tree(rev: string): Promise<readonly TreeEntry[]> {
    const cached = this.trees.get(rev);
    if (cached !== undefined) return cached;
    // jj remains authoritative for conflicts, symlinks and the revision's tree.
    const raw = await jj(
      this.cwd,
      [
        "file",
        "list",
        "-r",
        rev,
        "-T",
        'path ++ "\\0" ++ file_type ++ "\\0" ++ normal_value ++ "\\0"',
      ],
      this.ms,
    );
    const parts = raw.split("\0");
    if (parts.pop() !== "" || parts.length % 3 !== 0)
      return undetermined("invalid jj tree metadata");
    const entries: TreeEntry[] = [];
    for (let i = 0; i < parts.length; i += 3) {
      const path = parts[i];
      const kind = parts[i + 1];
      const id = parts[i + 2];
      if (path === undefined || kind === undefined || id === undefined)
        return undetermined("incomplete jj tree metadata");
      entries.push({ path, kind, id });
    }
    entries.sort((a, b) => (a.path < b.path ? -1 : Number(a.path > b.path)));
    this.trees.set(rev, entries);
    return entries;
  }

  async read(entries: readonly TreeEntry[]): Promise<ReadonlyMap<string, string>> {
    for (const entry of entries) {
      if (
        (entry.kind !== "file" && entry.kind !== "executable-file") ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(entry.id)
      )
        return undetermined(`unsupported or conflicted tree entry: ${entry.path} (${entry.kind})`);
    }
    const missing = [...new Set(entries.map((e) => e.id))].filter((id) => !this.blobs.has(id));
    if (missing.length > 0) {
      this.gitDirectory ??= (await jj(this.cwd, ["git", "root"], this.ms)).trim();
      const signal = AbortSignal.timeout(Math.max(1, Math.ceil(this.ms)));
      const child = Bun.spawn({
        cmd: [
          "git",
          "--no-replace-objects",
          `--git-dir=${this.gitDirectory}`,
          "cat-file",
          "--batch",
        ],
        cwd: this.cwd,
        stdin: new Blob([missing.join("\n") + "\n"]),
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
        env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_OPTIONAL_LOCKS: "0" },
      });
      const [output, stderr, exit] = await Promise.all([
        new Response(child.stdout).arrayBuffer(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (signal.aborted) return undetermined("git blob read timed out");
      if (exit !== 0) return undetermined(`git cat-file: ${stderr.trim()}`);
      const bytes = Buffer.from(output);
      let offset = 0;
      for (const id of missing) {
        const end = bytes.indexOf(10, offset);
        if (end < 0) return undetermined("truncated git blob header");
        const header = bytes.subarray(offset, end).toString("ascii").split(" ");
        const size = Number(header[2]);
        if (
          header.length !== 3 ||
          header[0] !== id ||
          header[1] !== "blob" ||
          !Number.isSafeInteger(size) ||
          size < 0
        )
          return undetermined(`invalid or missing git blob: ${id}`);
        offset = end + 1;
        if (size > bytes.length - offset - 1 || bytes[offset + size] !== 10)
          return undetermined(`truncated git blob: ${id}`);
        this.blobs.set(id, bytes.subarray(offset, offset + size).toString("utf8"));
        offset += size + 1;
      }
      if (offset !== bytes.length) return undetermined("unexpected git batch data");
    }
    return new Map(
      entries.map((e) => [e.path, this.blobs.get(e.id) ?? undetermined(`unread blob: ${e.path}`)]),
    );
  }
}
