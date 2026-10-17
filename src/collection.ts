import { z } from "zod";
import { type Config } from "./config.ts";
import { attempt, requireValue, undetermined } from "./errors.ts";
import { parseRecords, formatAdapter } from "./formats.ts";
import { loadTypes, matches } from "./policy.ts";
import { jj, RevisionReader } from "./repository.ts";
import {
  type FindingInput,
  type LoadedType,
  type RecordModel,
  type SourceFile,
  type TypeDefinition,
} from "./model.ts";

export interface Snapshot {
  readonly files: Readonly<Record<string, string>>;
  readonly records: readonly RecordModel[];
  readonly sources: ReadonlyMap<RecordModel, SourceFile>;
  readonly findings: readonly FindingInput[];
}
export function ignored(config: Config, path: string): boolean {
  return matches(config.files.ignore, path);
}
const parseFile = (path: string, text: string, format: TypeDefinition["format"]) =>
  attempt(() => parseRecords(path, text, format));
export function snapshotCache(cwd: string, ms: number) {
  return {
    reader: new RevisionReader(cwd, ms),
    parsed: new Map<TypeDefinition["format"], Map<string, ReturnType<typeof parseFile>>>(),
  };
}
export async function ruleFiles(
  cwd: string,
  rev: string,
  ms: number,
  reader = new RevisionReader(cwd, ms),
) {
  const files: Record<string, string> = Object.create(null);
  const entries = (await reader.tree(rev)).filter((e) => e.path.startsWith(".dx/"));
  for (const [path, text] of await reader.read(entries)) files[path] = text;
  return files;
}
export async function readSnapshot(
  cwd: string,
  rev: string,
  config: Config,
  types: readonly LoadedType[],
  ms: number,
  cache = snapshotCache(cwd, ms),
): Promise<Snapshot> {
  const files: Record<string, string> = Object.create(null);
  const records: RecordModel[] = [];
  const sources = new Map<RecordModel, SourceFile>();
  const findings: FindingInput[] = [];
  const recordPaths = new Set<string>();
  const entries = (await cache.reader.tree(rev)).filter(({ path }) => {
    const verdictPath = types.some(
      (t) => t.review?.place.startsWith("file:") === true && matches(t.review.place.slice(5), path),
    );
    return !ignored(config, path) || path.startsWith(".dx/") || path === "dx.toml" || verdictPath;
  });
  const contents = await cache.reader.read(entries);
  for (const { path, id: blobId } of entries) {
    const verdictPath = types.some(
      (t) => t.review?.place.startsWith("file:") === true && matches(t.review.place.slice(5), path),
    );
    if (ignored(config, path) && !path.startsWith(".dx/") && path !== "dx.toml" && !verdictPath)
      continue;
    const selected = types.filter((t) => matches(t.match, path));
    if (selected.length > 1) return undetermined(`file matches multiple types: ${path}`);
    // Policy/config/verdict files are infrastructure and exempt from strict matching.
    const auxiliary = path === "dx.toml" || path.startsWith(".dx/") || verdictPath;
    if (selected.length === 0 && !auxiliary) {
      if (config.files.strict)
        findings.push({
          check: "files.strict",
          path,
          field: path,
          message: "file matches no type",
        });
    }
    const text = requireValue(contents.get(path), "unread file: " + path);
    files[path] = text;
    const type = selected[0];
    if (type === undefined) continue;
    recordPaths.add(path);
    if (Buffer.byteLength(text) > config.limits.record_bytes)
      return undetermined(`limits.record_bytes exceeded: ${path}`);
    // Adapters can depend on the path; formats can differ for identical blobs.
    const key = JSON.stringify([path, blobId]);
    let byFormat = cache.parsed.get(type.format);
    if (byFormat === undefined) {
      byFormat = new Map();
      cache.parsed.set(type.format, byFormat);
    }
    let parsed = byFormat.get(key);
    if (parsed === undefined) {
      parsed = parseFile(path, text, type.format);
      byFormat.set(key, parsed);
    }
    if (parsed.isErr()) {
      findings.push({ check: "format", path, field: path, message: parsed.error });
      continue;
    }
    if (parsed.value.length === 0)
      findings.push({ check: "format", path, field: path, message: "record container is empty" });
    for (const file of parsed.value) {
      if (records.length >= config.limits.records) return undetermined("limits.records exceeded");
      const id = z.string().min(1).parse(type.id(file));
      const result = type.schema.safeParse(file.fields);
      if (!result.success) {
        for (const issue of result.error.issues)
          findings.push({
            check: "schema",
            id,
            path,
            field: issue.path.map(String).join("."),
            message: issue.message,
          });
      }
      if (type.filename !== undefined) {
        type.filename.lastIndex = 0;
        if (!type.filename.test(file.name))
          findings.push({
            check: "filename",
            id,
            path,
            field: "name",
            message: "filename does not match type rule",
          });
      }
      const links: { rel: string; to: string }[] = [];
      for (const rel of Object.keys(type.links).toSorted()) {
        const raw = file.fields[rel];
        if (raw === undefined) continue;
        const targets = z.union([z.string().min(1), z.array(z.string().min(1))]).safeParse(raw);
        if (!targets.success) {
          findings.push({
            check: "I-04.links",
            id,
            path,
            field: rel,
            message: "link must be an id or an array of ids",
          });
          continue;
        }
        for (const to of typeof targets.data === "string" ? [targets.data] : targets.data)
          links.push({ rel, to });
      }
      if (links.length > config.limits.links_per_record)
        return undetermined(`limits.links_per_record exceeded: ${id}`);
      const by = z.string().min(1).safeParse(file.fields.by);
      const record: RecordModel = {
        v: 1,
        id,
        type: type.name,
        path,
        sha256: formatAdapter(type.format).hash(file),
        ...(by.success ? { by: by.data } : {}),
        links,
        fields: file.fields,
      };
      records.push(record);
      sources.set(record, file);
    }
  }
  // Keep raw bytes for immutable and I-09, including files rejected by the parser.
  for (const path of recordPaths) requireValue(files[path], `unread record: ${path}`);
  return { files, records, sources, findings };
}
export async function changedPaths(cwd: string, base: string, head: string, ms: number) {
  const diff = await jj(cwd, ["diff", "--from", base, "--to", head, "-T", 'path ++ "\\0"'], ms);
  return new Set(diff.split("\0").filter(Boolean));
}

/** I-09 applies to each change, so a rule-only commit may precede a record-only commit. */
export async function changeSets(cwd: string, base: string, head: string, ms: number) {
  const ancestor = await jj(
    cwd,
    ["log", "--no-graph", "-r", `${base} & ancestors(${head})`, "-T", "commit_id"],
    ms,
  );
  if (ancestor.trim() === "")
    return [{ paths: await changedPaths(cwd, base, head, ms), before: [base], after: head }];
  const log = await jj(
    cwd,
    [
      "log",
      "--no-graph",
      "-r",
      `${base}..${head}`,
      "-T",
      'commit_id ++ "\\0" ++ parents.map(|p| p.commit_id()).join(" ") ++ "\\0"',
    ],
    ms,
  );
  const parts = log.split("\0");
  const sets: { paths: Set<string>; before: string[]; after: string }[] = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const commit = parts[index];
    const parents = parts[index + 1]?.split(" ").filter(Boolean) ?? [];
    if (commit === undefined) continue;
    const changed = new Set<string>();
    for (const parent of parents)
      for (const path of await changedPaths(cwd, parent, commit, ms)) changed.add(path);
    sets.push({ paths: changed, before: parents, after: commit });
  }
  return sets;
}

export async function isolationFindings(
  cwd: string,
  base: string,
  head: string,
  config: Config,
  types: readonly LoadedType[],
  ms: number,
  reader = new RevisionReader(cwd, ms),
): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];
  const cache = new Map<string, readonly LoadedType[]>([[head, types]]);
  const definitions = async (rev: string) => {
    const cached = cache.get(rev);
    if (cached !== undefined) return cached;
    const files = await ruleFiles(cwd, rev, ms, reader);
    const loaded = Object.keys(files).some((p) => /^\.dx\/[^/]+\.ts$/u.test(p))
      ? await loadTypes(files)
      : [];
    cache.set(rev, loaded);
    return loaded;
  };
  for (const change of await changeSets(cwd, base, head, ms)) {
    if (![...change.paths].some((path) => path.startsWith(".dx/"))) continue;
    const candidates = [...change.paths].filter(
      (path) => !path.startsWith(".dx/") && !ignored(config, path),
    );
    if (candidates.length === 0) continue;
    // Include definitions at both sides: removing/changing a match cannot hide the record edit.
    const localTypes = [...(await definitions(change.after))];
    for (const parent of change.before) localTypes.push(...(await definitions(parent)));
    for (const path of candidates.filter((p) => localTypes.some((type) => matches(type.match, p))))
      findings.push({
        check: "I-09.policy",
        path,
        field: path,
        message: "policy and records changed together",
      });
  }
  return findings;
}
