import { attemptAsync, requireValue, undetermined } from "./errors.ts";
import { ok, safeTry } from "neverthrow";
import { resolve } from "node:path";

const minimumJjVersion = "0.46.0";
let versionCheck:
  | Promise<ReturnType<typeof undetermined> | ReturnType<typeof ok<void, string>>>
  | undefined;

function meetsMinimumVersion(version: string) {
  const actual = version.split(".").map(Number);
  const minimum = minimumJjVersion.split(".").map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if (actual[i]! > minimum[i]!) return true;
    if (actual[i]! < minimum[i]!) return false;
  }
  return true;
}

function versionFailure(found: string, location: string | null) {
  return undetermined(
    `jj ${minimumJjVersion} 以上が要る（見つかったのは ${found} at ${location}）。PATH の先頭に新しい jj を置く`,
  );
}

async function readJjVersion(location: string) {
  const child = Bun.spawn({ cmd: [location, "--version"], stdout: "pipe", stderr: "ignore" });
  const [output, exit] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return { output, exit };
}

async function detectJjVersion(location: string | null) {
  if (location === null) return versionFailure("不明", location);
  const result = await attemptAsync(() => readJjVersion(location));
  if (result.isErr()) return versionFailure("不明", location);
  const { output, exit } = result.value;
  const match = /^jj\s+(\d+)\.(\d+)\.(\d+)(?:[-+\s]|$)/u.exec(output.trim());
  if (exit !== 0 || match === null) return versionFailure("不明", location);
  const found = `${match[1]}.${match[2]}.${match[3]}`;
  if (!meetsMinimumVersion(found)) return versionFailure(found, location);
  return ok(undefined);
}

function checkJjVersion() {
  return (versionCheck ??= detectJjVersion(Bun.which("jj")));
}

export async function snapshotWorkingCopy(cwd: string) {
  const version = await checkJjVersion();
  if (version.isErr()) return version;
  const signal = AbortSignal.timeout(120000);
  const child = Bun.spawn({
    cmd: ["jj", "--no-pager", "--color=never", "util", "snapshot"],
    cwd,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  const [stderr, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exit !== 0 || signal.aborted)
    return undetermined(
      `作業コピーを取り込めない: ${stderr.split("\n")[0] ?? ""}。jj st で原因を見るか、commit してから semlint check @- にかける`,
    );
  return ok(undefined);
}

async function runJj(cwd: string, args: string[], milliseconds: number) {
  const signal = AbortSignal.timeout(Math.max(1, Math.ceil(milliseconds)));
  const child = Bun.spawn({
    cmd: ["jj", "--ignore-working-copy", "--no-pager", "--color=never", ...args],
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
  return { stdout, stderr, exit, aborted: signal.aborted };
}

// Concurrent jj operations leave several operation heads; `--at-operation=@` then refuses to pick one.
const divergentOperations = 'The "@" expression resolved to more than one operation';

export async function jj(cwd: string, args: string[], milliseconds = 120000) {
  const version = await checkJjVersion();
  if (version.isErr()) return version;
  let result = await runJj(cwd, ["--at-operation=@", ...args], milliseconds);
  if (!result.aborted && result.exit !== 0 && result.stderr.includes(divergentOperations)) {
    // Loading the repository without a pinned operation merges the heads, as any jj command does.
    const merge = await runJj(cwd, ["log", "--no-graph", "-r", "root()", "-T", '""'], milliseconds);
    if (merge.aborted) return undetermined("jj read timed out");
    if (merge.exit !== 0)
      return undetermined(`jj の並行した操作を合流できない: ${merge.stderr.trim()}`);
    result = await runJj(cwd, ["--at-operation=@", ...args], milliseconds);
  }
  if (result.aborted) return undetermined("jj read timed out");
  if (result.exit !== 0) return undetermined(`jj: ${result.stderr.trim()}`);
  return ok(result.stdout);
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

export class BlobContents extends Map<string, string> {
  constructor(readonly invalidUtf8 = new Map<string, number>()) {
    super();
  }
}

/** One command's immutable revision data; nothing is written to the repository. */
export class RevisionReader {
  private readonly trees = new Map<string, readonly TreeEntry[]>();
  private readonly blobs = new Map<string, string>();
  private readonly invalidBlobs = new Map<string, number>();
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
    const { blobs, invalidBlobs, git, cwd, ms } = this;
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
      const missing = [...new Set(entries.map((e) => e.id))].filter(
        (id) => !blobs.has(id) && !invalidBlobs.has(id),
      );
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
        yield* cacheBlobs(bytes, missing, blobs, invalidBlobs);
      }
      const contents = new BlobContents();
      for (const entry of entries) {
        const invalid = invalidBlobs.get(entry.id);
        if (invalid !== undefined) {
          contents.invalidUtf8.set(entry.path, invalid);
          continue;
        }
        contents.set(
          entry.path,
          yield* requireValue(blobs.get(entry.id), "unread blob: " + entry.path),
        );
      }
      return ok(contents);
    });
  }
}

function cacheBlobs(
  bytes: Buffer,
  missing: string[],
  blobs: Map<string, string>,
  invalidBlobs: Map<string, number>,
) {
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
    const blob = bytes.subarray(offset, offset + size);
    const invalidAt = invalidUtf8At(blob);
    if (invalidAt === undefined)
      blobs.set(id, new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(blob));
    else invalidBlobs.set(id, invalidAt);
    offset += size + 1;
  }
  if (offset !== bytes.length) return undetermined("unexpected git batch data");
  return ok(undefined);
}

function validThreeByteSecond(first: number, second: number | undefined): boolean {
  return (
    second !== undefined &&
    second >= 0x80 &&
    second <= 0xbf &&
    (first !== 0xe0 || second >= 0xa0) &&
    (first !== 0xed || second <= 0x9f)
  );
}

function validFourByteSecond(first: number, second: number | undefined): boolean {
  return (
    second !== undefined &&
    second >= 0x80 &&
    second <= 0xbf &&
    (first !== 0xf0 || second >= 0x90) &&
    (first !== 0xf4 || second <= 0x8f)
  );
}

/** Return the first byte that cannot begin a valid UTF-8 sequence. */
function invalidUtf8At(bytes: Buffer): number | undefined {
  const continuation = (index: number) => {
    const byte = bytes[index];
    return byte !== undefined && byte >= 0x80 && byte <= 0xbf;
  };
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first === undefined) return undefined;
    if (first <= 0x7f) {
      index++;
      continue;
    }
    if (first >= 0xc2 && first <= 0xdf && !continuation(index + 1)) return index;
    if (first >= 0xc2 && first <= 0xdf) {
      index += 2;
      continue;
    }
    if (
      first >= 0xe0 &&
      first <= 0xef &&
      (!validThreeByteSecond(first, bytes[index + 1]) || !continuation(index + 2))
    )
      return index;
    if (first >= 0xe0 && first <= 0xef) {
      index += 3;
      continue;
    }
    if (
      first >= 0xf0 &&
      first <= 0xf4 &&
      (!validFourByteSecond(first, bytes[index + 1]) ||
        !continuation(index + 2) ||
        !continuation(index + 3))
    )
      return index;
    if (first >= 0xf0 && first <= 0xf4) {
      index += 4;
      continue;
    }
    return index;
  }
  return undefined;
}
