import { requireValue, undetermined } from "./errors.ts";
import { ok, safeTry } from "neverthrow";
import { resolve } from "node:path";

export async function jj(cwd: string, args: string[], milliseconds = 120000) {
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
  return ok(stdout);
}
export async function root(cwd: string) {
  return safeTry(async function* () {
    return ok(resolve((yield* await jj(cwd, ["root"])).trim()));
  });
}
export async function revision(cwd: string, rev: string) {
  return safeTry(async function* () {
    const ids = (yield* await jj(cwd, ["log", "--no-graph", "-r", rev, "-T", 'commit_id ++ "\\n"']))
      .trim()
      .split("\n");
    if (ids.length !== 1 || !/^[a-f0-9]{40,64}$/u.test(ids[0] ?? ""))
      return undetermined(`REV must resolve to one commit: ${rev}`);
    return ok(yield* requireValue(ids[0], `missing REV: ${rev}`));
  });
}
/** Only an absent default remote bookmark falls back; explicit revsets stay strict. */
export async function defaultBase(cwd: string, branch: string, remote: string) {
  return safeTry(async function* () {
    const symbol = `${JSON.stringify(branch)}@${JSON.stringify(remote)}`;
    const present = yield* await jj(cwd, [
      "log",
      "--no-graph",
      "-r",
      `present(${symbol})`,
      "-T",
      "commit_id",
    ]);
    const fallback = present.trim() === "";
    return ok({ rev: yield* await revision(cwd, fallback ? "root()" : symbol), fallback });
  });
}
export async function paths(cwd: string, rev: string, ms: number) {
  return safeTry(async function* () {
    const text = yield* await jj(cwd, ["file", "list", "-r", rev, "-T", 'path ++ "\\0"'], ms);
    return ok(text.split("\0").filter(Boolean).toSorted());
  });
}
export async function show(cwd: string, rev: string, path: string, ms: number) {
  return safeTry(async function* () {
    // Fileset literals preserve spaces, wildcard characters, colons and newlines.
    const metadata = yield* await jj(
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
    return ok(metadata.slice(separator + 1));
  });
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
  private readonly git: { directory?: string } = {};

  constructor(
    private readonly cwd: string,
    private readonly ms: number,
  ) {}

  async tree(rev: string) {
    const { trees, cwd, ms } = this;
    return safeTry(async function* () {
      const cached = trees.get(rev);
      if (cached !== undefined) return ok(cached);
      // jj remains authoritative for conflicts, symlinks and the revision's tree.
      const raw = yield* await jj(
        cwd,
        [
          "file",
          "list",
          "-r",
          rev,
          "-T",
          'path ++ "\\0" ++ file_type ++ "\\0" ++ normal_value ++ "\\0"',
        ],
        ms,
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
      trees.set(rev, entries);
      return ok(entries);
    });
  }

  async read(entries: readonly TreeEntry[]) {
    const { blobs, git, cwd, ms } = this;
    return safeTry(async function* () {
      for (const entry of entries) {
        if (
          (entry.kind !== "file" && entry.kind !== "executable-file") ||
          !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(entry.id)
        )
          return undetermined(
            `unsupported or conflicted tree entry: ${entry.path} (${entry.kind})`,
          );
      }
      const missing = [...new Set(entries.map((e) => e.id))].filter((id) => !blobs.has(id));
      if (missing.length > 0) {
        git.directory ??= (yield* await jj(cwd, ["git", "root"], ms)).trim();
        const signal = AbortSignal.timeout(Math.max(1, Math.ceil(ms)));
        const child = Bun.spawn({
          cmd: ["git", "--no-replace-objects", `--git-dir=${git.directory}`, "cat-file", "--batch"],
          cwd: cwd,
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
        yield* cacheBlobs(bytes, missing, blobs);
      }
      const contents = new Map<string, string>();
      for (const entry of entries)
        contents.set(
          entry.path,
          yield* requireValue(blobs.get(entry.id), "unread blob: " + entry.path),
        );
      return ok(contents);
    });
  }
}

function cacheBlobs(bytes: Buffer, missing: string[], blobs: Map<string, string>) {
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
    blobs.set(id, bytes.subarray(offset, offset + size).toString("utf8"));
    offset += size + 1;
  }
  if (offset !== bytes.length) return undetermined("unexpected git batch data");
  return ok(undefined);
}
