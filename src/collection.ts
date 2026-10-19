import { validate, requireValue, attempt, undetermined } from "./errors.ts";

import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { inputPatternsSchema, type Config } from "./config.ts";

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
  /** Raw revision blob IDs, before policy overlays or ignore filtering. */
  readonly fileIds: ReadonlyMap<string, string>;
  readonly files: Readonly<Record<string, string>>;
  readonly records: readonly RecordModel[];
  readonly sources: ReadonlyMap<RecordModel, SourceFile>;
  readonly findings: readonly FindingInput[];
}
// Historical configuration contributes only its input declaration to I-09.
// Other historical settings need not be valid under head's configuration schema.
const inputConfigSchema = z.object({
  files: z.object({ inputs: inputPatternsSchema }).prefault({}),
});
export function ignored(config: Config, path: string): boolean {
  return matches(config.files.ignore, path);
}
const parseFile = (path: string, text: string, format: TypeDefinition["format"]) =>
  attempt(() => parseRecords(path, text, format)).andThen((result) => result);
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
  return safeTry(async function* () {
    const files: Record<string, string> = {};
    Object.setPrototypeOf(files, null);
    const entries = (yield* await reader.tree(rev)).filter((e) => e.path.startsWith(".dx/"));
    for (const [path, text] of yield* await reader.read(entries)) files[path] = text;
    return ok(files);
  });
}
export async function readSnapshot(
  cwd: string,
  rev: string,
  config: Config,
  types: readonly LoadedType[],
  ms: number,
  cache = snapshotCache(cwd, ms),
  policyFiles?: ReadonlyMap<string, string>,
) {
  return safeTry(async function* () {
    const files: Record<string, string> = {};
    Object.setPrototypeOf(files, null);
    const records: RecordModel[] = [];
    const sources = new Map<RecordModel, SourceFile>();
    const findings: FindingInput[] = [];
    const appendRecord = (file: SourceFile, type: LoadedType) =>
      safeTry(function* () {
        if (records.length >= config.limits.records) return undetermined("limits.records exceeded");
        const record = yield* makeRecord(file, type, config, findings);
        records.push(record);
        sources.set(record, file);
        return ok(undefined);
      });
    const recordPaths = new Set<string>();
    const tree = yield* await cache.reader.tree(rev);
    const fileIds = new Map(tree.map(({ path, id }) => [path, id]));
    const entries = tree.filter(({ path }) => {
      if (
        policyFiles !== undefined &&
        (matches(config.files.inputs, path) || path === "dx.toml" || path.startsWith(".dx/"))
      )
        return false;
      const verdictPath = types.some(
        (t) =>
          t.review?.place.startsWith("file:") === true && matches(t.review.place.slice(5), path),
      );
      return (
        !ignored(config, path) ||
        matches(config.files.inputs, path) ||
        path.startsWith(".dx/") ||
        path === "dx.toml" ||
        verdictPath
      );
    });
    const contents = yield* await cache.reader.read(entries);
    for (const { path, id: blobId } of entries) {
      const verdictPath = types.some(
        (t) =>
          t.review?.place.startsWith("file:") === true && matches(t.review.place.slice(5), path),
      );
      const input = matches(config.files.inputs, path);
      if (
        ignored(config, path) &&
        !input &&
        !path.startsWith(".dx/") &&
        path !== "dx.toml" &&
        !verdictPath
      )
        continue;
      const selected = input ? [] : types.filter((t) => matches(t.match, path));
      if (selected.length > 1) return undetermined(`file matches multiple types: ${path}`);
      // Policy/config/verdict files are infrastructure and exempt from strict matching.
      const auxiliary = input || path === "dx.toml" || path.startsWith(".dx/") || verdictPath;
      if (selected.length === 0 && !auxiliary && config.files.strict)
        findings.push({
          check: "files.strict",
          path,
          field: path,
          message: "file matches no type",
        });
      const text = yield* requireValue(contents.get(path), "unread file: " + path);
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
        yield* appendRecord(file, type);
      }
    }
    // Rules and inputs share one revision, including additions and deletions.
    // They remain auxiliary even when a type also matches their paths.
    for (const [path, text] of policyFiles ?? []) files[path] = text;
    // Keep raw bytes for immutable and I-09, including files rejected by the parser.
    for (const path of recordPaths) yield* requireValue(files[path], `unread record: ${path}`);
    return ok({ fileIds, files, records, sources, findings });
  });
}
export async function changedPaths(cwd: string, base: string, head: string, ms: number) {
  return safeTry(async function* () {
    const diff = yield* await jj(
      cwd,
      ["diff", "--from", base, "--to", head, "-T", 'path ++ "\\0"'],
      ms,
    );
    return ok(new Set(diff.split("\0").filter(Boolean)));
  });
}

/** I-09 applies to each change, so a rule-only commit may precede a record-only commit. */
export async function changeSets(cwd: string, base: string, head: string, ms: number) {
  return safeTry(async function* () {
    const ancestor = yield* await jj(
      cwd,
      ["log", "--no-graph", "-r", `${base} & ancestors(${head})`, "-T", "commit_id"],
      ms,
    );
    if (ancestor.trim() === "")
      return ok([
        { paths: yield* await changedPaths(cwd, base, head, ms), before: [base], after: head },
      ]);
    const log = yield* await jj(
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
      const changed = yield* await parentChanges(cwd, parents, commit, ms);
      sets.push({ paths: changed, before: parents, after: commit });
    }
    return ok(sets);
  });
}

export async function isolationFindings(
  cwd: string,
  base: string,
  head: string,
  config: Config,
  types: readonly LoadedType[],
  ms: number,
  reader = new RevisionReader(cwd, ms),
) {
  return safeTry(async function* () {
    const findings: FindingInput[] = [];
    const cache = new Map<string, readonly LoadedType[]>([[head, types]]);
    const inputCache = new Map<string, readonly string[]>([[head, config.files.inputs]]);
    const inputs = async (rev: string) =>
      safeTry(async function* () {
        const cached = inputCache.get(rev);
        if (cached !== undefined) return ok(cached);
        const entries = (yield* await reader.tree(rev)).filter((e) => e.path === "dx.toml");
        const text = (yield* await reader.read(entries)).get("dx.toml");
        const patterns =
          text === undefined
            ? []
            : (yield* validate(
                inputConfigSchema,
                yield* attempt((): unknown => Bun.TOML.parse(text)),
              )).files.inputs;
        inputCache.set(rev, patterns);
        return ok(patterns);
      });
    const definitions = async (rev: string) =>
      safeTry(async function* () {
        const cached = cache.get(rev);
        if (cached !== undefined) return ok(cached);
        const files = yield* await ruleFiles(cwd, rev, ms, reader);
        const loaded = Object.keys(files).some((p) => /^\.dx\/[^/]+\.ts$/u.test(p))
          ? yield* await loadTypes(files)
          : [];
        cache.set(rev, loaded);
        return ok(loaded);
      });
    for (const change of yield* await changeSets(cwd, base, head, ms)) {
      const afterInputs = yield* await inputs(change.after);
      const localInputs = [...afterInputs];
      let declarationChanged = false;
      for (const parent of change.before) {
        const beforeInputs = yield* await inputs(parent);
        declarationChanged ||= JSON.stringify(beforeInputs) !== JSON.stringify(afterInputs);
        localInputs.push(...beforeInputs);
      }
      const policyPath = (path: string) => path.startsWith(".dx/") || matches(localInputs, path);
      if (!declarationChanged && ![...change.paths].some((path) => policyPath(path))) continue;
      const candidates = [...change.paths].filter(
        (path) => !policyPath(path) && !ignored(config, path),
      );
      if (candidates.length === 0) continue;
      // Include definitions at both sides: removing/changing a match cannot hide the record edit.
      const localTypes = [...(yield* await definitions(change.after))];
      for (const parent of change.before) localTypes.push(...(yield* await definitions(parent)));
      for (const path of candidates.filter((p) =>
        localTypes.some((type) => matches(type.match, p)),
      ))
        findings.push({
          check: "I-09.policy",
          path,
          field: path,
          message: "policy and records changed together",
        });
    }
    return ok(findings);
  });
}

function makeRecord(file: SourceFile, type: LoadedType, config: Config, findings: FindingInput[]) {
  return safeTry(function* () {
    const path = file.path;
    const id = yield* validate(z.string().min(1), type.id(file));
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
      const declaration = type.links[rel];
      if (declaration === undefined) continue;
      const candidates = yield* linkCandidates(raw, declaration, `${path}: links.${rel}`);
      if (candidates === undefined) {
        findings.push({
          check: "I-04.links",
          id,
          path,
          field: rel,
          message: "link must be an id or an array of ids",
        });
        continue;
      }
      for (const candidate of candidates)
        links.push(
          ...(yield* linkTarget(candidate, config.repo.name)
            .map((to) => (to === undefined ? [] : [{ rel, to }]))
            .mapErr((reason) => `${path}: links.${rel}: ${reason}`)),
        );
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

    return ok(record);
  });
}

function linkCandidates(raw: unknown, link: LoadedType["links"][string], locus: string) {
  return safeTry(function* () {
    const values = link.values;
    if (values !== undefined) {
      const extracted = yield* attempt(() => values(raw)).mapErr(
        (reason) => `${locus}.values: ${reason}`,
      );
      const parsed = z.array(z.string()).safeParse(extracted);
      if (!parsed.success) return undetermined(`${locus}.values must return an array of strings`);
      return ok(parsed.data);
    }
    const parsed = z.union([z.string().min(1), z.array(z.string().min(1))]).safeParse(raw);
    if (!parsed.success) return ok(undefined);
    return ok(typeof parsed.data === "string" ? [parsed.data] : parsed.data);
  });
}

function linkTarget(id: string, repo: string) {
  if (id.length === 0) return undetermined("link id must be non-empty");
  const qualified = /^dx:([^/]+)\/(.+)$/u.exec(id);
  if (qualified === null) return ok(id);
  if (qualified[1] !== repo) return ok(undefined);
  return requireValue(qualified[2], "dx: reference requires an id");
}

async function parentChanges(cwd: string, parents: string[], commit: string, ms: number) {
  return safeTry(async function* () {
    const changed = new Set<string>();
    for (const parent of parents)
      for (const path of yield* await changedPaths(cwd, parent, commit, ms)) changed.add(path);
    return ok(changed);
  });
}
