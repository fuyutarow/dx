import { jsonText } from "../.dx-preset/zod.ts";
import { requireValue, attempt, undetermined } from "./errors.ts";
import { ok, safeTry } from "neverthrow";
import { posix } from "node:path";
import { z } from "zod";
import { REVIEW_PASS } from "./config.ts";
import type { Snapshot } from "./collection.ts";

import {
  findingInputSchema,
  verdictSchema,
  type FindingInput,
  type LoadedType,
  type RecordModel,
  type TreeContext,
} from "./model.ts";
import { isPolicyPath, matches } from "./policy.ts";
import { sha256, stableJson } from "./formats.ts";
import { inputPatternsSchema } from "./config.ts";

function policyInputs(files: Readonly<Record<string, string>>): readonly string[] {
  const config = attempt((): unknown => Bun.TOML.parse(files["dx.toml"] ?? ""));
  if (config.isErr()) return [];
  const parsedConfig = z
    .object({ files: z.object({ inputs: z.unknown().optional() }).optional() })
    .safeParse(config.value);
  if (!parsedConfig.success) return [];
  const parsed = inputPatternsSchema.safeParse(parsedConfig.data.files?.inputs ?? []);
  return parsed.success ? parsed.data : [];
}

export function reviewPlacePolicy(
  types: readonly LoadedType[],
  files: Readonly<Record<string, string>>,
  inputs?: readonly string[],
) {
  const declaredInputs = inputs ?? policyInputs(files);
  for (const type of types) {
    const place = type.review?.place;
    if (
      place?.startsWith("file:") === true &&
      (place.slice(5).startsWith(".dx/") ||
        Object.keys(files).some(
          (path) => matches(place.slice(5), path) && isPolicyPath(path, declaredInputs),
        ))
    )
      return undetermined(
        `policy: ${type.name}: review.place は規則のファイル（dx.toml、.dx/、inputs）の外に置く`,
      );
  }
  return ok(undefined);
}

export function context(snapshot: Snapshot, base: Snapshot): TreeContext {
  return Object.freeze({
    index: Object.freeze({
      byId: groups(snapshot.records, "id"),
      byType: groups(snapshot.records, "type"),
    }),
    records: Object.freeze([...snapshot.records]),
    base: Object.freeze([...base.records]),
    files: Object.freeze({ ...snapshot.files }),
    read: (path: string) => snapshot.files[path],
  });
}
function groups(records: readonly RecordModel[], key: "id" | "type" = "id") {
  const result = new Map<string, RecordModel[]>();
  for (const record of records) {
    const values = result.get(record[key]) ?? [];
    values.push(record);
    result.set(record[key], values);
  }
  return result;
}
export async function structural(snapshot: Snapshot, base: Snapshot, types: readonly LoadedType[]) {
  const findings = [...snapshot.findings];
  const tree = context(snapshot, base);
  const byId = tree.index.byId;
  const definitions = new Map(types.map((t) => [t.name, t]));
  for (const [id, records] of byId) {
    for (const record of records.slice(1))
      findings.push({
        check: "I-05.duplicate",
        id,
        path: record.path,
        field: `id:${record.path}:${snapshot.sources.get(record)?.index ?? 0}`,
        message: "duplicate record id",
      });
  }
  // Iterative DFS with an active stack bounds memory and avoids JS recursion limits.
  const graph = new Map<RecordModel, RecordModel[]>();
  for (const record of snapshot.records) {
    linkEdges(record, definitions.get(record.type), byId, graph, findings);
  }
  const color = new Map<RecordModel, number>();
  for (const record of snapshot.records) {
    if (color.has(record)) continue;
    cycleFindings(record, graph, color, findings);
  }
  for (const [record, check] of snapshot.records.flatMap((row) =>
    (definitions.get(row.type)?.checks ?? []).map((callback) => [row, callback] as const),
  )) {
    const result = z.array(findingInputSchema).safeParse(await check(record, tree));
    if (!result.success) return undetermined(`invalid custom findings: ${result.error.message}`);
    findings.push(
      ...result.data.map((row) =>
        Object.assign(
          {
            check: row.check,
            path: row.path,
            message: row.message,
            ...(row.ids === undefined ? { id: row.id ?? record.id } : { ids: row.ids }),
          },
          row.field === undefined ? {} : { field: row.field },
        ),
      ),
    );
  }
  for (const check of types.flatMap((type) => type.treeChecks)) {
    const result = z.array(findingInputSchema).safeParse(await check(tree));
    if (!result.success) return undetermined(`invalid custom findings: ${result.error.message}`);
    findings.push(
      ...result.data.map((row) =>
        Object.assign(
          { check: row.check, path: row.path, message: row.message },
          row.id === undefined ? {} : { id: row.id },
          row.ids === undefined ? {} : { ids: row.ids },
          row.field === undefined ? {} : { field: row.field },
        ),
      ),
    );
  }
  return ok(findings);
}
export function transitions(
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
): FindingInput[] {
  const findings: FindingInput[] = [];
  const byId = groups(head.records);
  const slots = new Map(
    head.records.map((r) => [JSON.stringify([r.type, r.path, head.sources.get(r)?.index]), r]),
  );
  for (const record of base.records) {
    const type = types.find((t) => t.name === record.type);
    const current = byId.get(record.id)?.[0];
    const oldSource = base.sources.get(record);
    const newSource = current === undefined ? undefined : head.sources.get(current);
    const contentChanged =
      type?.format === "toml"
        ? stableJson(oldSource?.fields) !== stableJson(newSource?.fields)
        : oldSource?.text !== newSource?.text;
    if (
      type?.immutable === true &&
      (current === undefined || current.path !== record.path || contentChanged)
    )
      findings.push({
        check: "I-03.immutable",
        id: record.id,
        path: record.path,
        field: "content",
        message: "immutable record changed or disappeared",
      });
    const slot = slots.get(
      JSON.stringify([record.type, record.path, base.sources.get(record)?.index]),
    );
    if (slot !== undefined && slot.id !== record.id)
      findings.push({
        check: "I-05.identity",
        id: record.id,
        path: record.path,
        field: "id",
        message: "record id was reassigned",
      });
    if (current !== undefined && current.type !== record.type)
      findings.push({
        check: "I-05.identity",
        id: record.id,
        path: current.path,
        field: "id",
        message: "record id was reassigned to another type",
      });
  }
  return findings;
}
export function rubricPath(type: LoadedType) {
  return safeTry(function* () {
    const raw = yield* requireValue(type.review?.rubric, `no rubric for ${type.name}`);
    const path = posix.normalize(raw.startsWith(".dx/") ? raw : `.dx/${raw}`);
    if (!path.startsWith(".dx/")) return undetermined(`rubric must be in .dx/: ${raw}`);
    return ok(path);
  });
}
export function sidecarVerdicts(text: string, path: string): unknown[] {
  const parsed = attempt((): unknown => {
    if (path.endsWith(".toml")) return Bun.TOML.parse(text);
    const decoded = jsonText.safeParse(text);
    return decoded.success ? decoded.data : undefined;
  });
  if (parsed.isOk() && parsed.value !== undefined) {
    const container = z.object({ verdicts: z.array(z.unknown()) }).safeParse(parsed.value);
    if (container.success) return container.data.verdicts;
    return Array.isArray(parsed.value) ? parsed.value : [parsed.value];
  }
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const rows = lines.map((line) => jsonText.safeParse(line));
  if (rows.some((row) => !row.success)) return [];
  return rows.flatMap((row) => (row.success ? [row.data] : []));
}
export function reviews(base: Snapshot, head: Snapshot, types: readonly LoadedType[]) {
  return safeTry(function* () {
    const findings: FindingInput[] = [];
    const previous = groups(base.records);
    for (const type of types) {
      if (type.review === undefined) continue;
      const rubric = yield* rubricPath(type);
      const text = yield* requireValue(head.files[rubric], `rubric missing: ${rubric}`);
      const rubricHash = sha256(text);
      const hasPassingVerdict = yield* verdictChecker(head, type, rubricHash);
      for (const record of head.records.filter(
        (r) =>
          r.type === type.name &&
          reviewChanged(previous.get(r.id)?.[0], r) &&
          !hasPassingVerdict(r),
      )) {
        findings.push({
          check: "I-06.verdict",
          id: record.id,
          path: record.path,
          field: "review",
          message:
            "missing passing verdict bound to this record, rubric and another author; dx review は verdict を作業コピーに書く。verdict を含む commit を land する（例: dx land @）",
        });
      }
    }
    return ok(findings);
  });
}

/** Shared by I-06 and review retries: one schema, binding and storage reader. */
export function verdictChecker(head: Snapshot, type: LoadedType, rubricHash?: string) {
  return safeTry(function* () {
    const path = yield* rubricPath(type);
    const hash = rubricHash ?? sha256(yield* requireValue(head.files[path], "missing rubric"));
    const review = yield* requireValue(type.review, "missing review definition");
    const raw = Object.entries(head.files)
      .filter(([filePath]) => matches(review.place.slice(5), filePath))
      .flatMap(([filePath, text]) => sidecarVerdicts(text, filePath));
    return ok((record: RecordModel) =>
      raw.some((value) => {
        const result = verdictSchema.safeParse(value);
        if (!result.success) return false;
        const v = result.data;
        return (
          v.id === record.id &&
          v.sha256 === record.sha256 &&
          v.rubric_sha256 === hash &&
          (v.rubric === review.rubric || v.rubric === path) &&
          v.pass &&
          reviewerAllowed(record.by, v.by) &&
          v.p.every((p) => p >= REVIEW_PASS)
        );
      }),
    );
  });
}

/** Match the I-06 target set when record content changes. */
export function reviewChanged(old: RecordModel | undefined, record: RecordModel): boolean {
  return old === undefined || old.sha256 !== record.sha256;
}

/** I-06: unknown record authors require a machine reviewer; known authors must differ. */
export function reviewerAllowed(author: string | undefined, reviewer: string): boolean {
  return author === undefined ? reviewer.startsWith("process:") : reviewer !== author;
}

function linkEdges(
  record: RecordModel,
  type: LoadedType | undefined,
  byId: ReadonlyMap<string, readonly RecordModel[]>,
  graph: Map<RecordModel, RecordModel[]>,
  findings: FindingInput[],
) {
  const edges: RecordModel[] = [];
  graph.set(record, edges);
  for (const link of record.links) {
    const targets = byId.get(link.to) ?? [];
    if (targets.length !== 1)
      findings.push({
        check: "I-04.target",
        id: record.id,
        path: record.path,
        field: `${link.rel}:${link.to}`,
        message: "link target is missing or ambiguous",
      });
    const target = targets[0];
    if (target === undefined) continue;
    const allowed = type?.links[link.rel]?.to;
    const allowedTypes = typeof allowed === "string" ? [allowed] : (allowed ?? []);
    if (!allowedTypes.includes(target.type))
      findings.push({
        check: "I-04.type",
        id: record.id,
        path: record.path,
        field: `${link.rel}:${link.to}`,
        message: "link target has the wrong type",
      });
    if (type?.links[link.rel]?.acyclic !== false) edges.push(target);
  }
}

function cycleFindings(
  record: RecordModel,
  graph: Map<RecordModel, RecordModel[]>,
  color: Map<RecordModel, number>,
  findings: FindingInput[],
) {
  const stack = [{ record, next: 0 }];
  color.set(record, 1);
  while (stack.length > 0) {
    const frame = stack.at(-1);
    if (frame === undefined) break;
    const edges = graph.get(frame.record) ?? [];
    const target = edges[frame.next];
    frame.next += 1;
    if (target === undefined) {
      color.set(frame.record, 2);
      stack.pop();
    } else if (color.get(target) === 1) {
      findings.push({
        check: "I-04.cycle",
        id: frame.record.id,
        path: frame.record.path,
        field: "links",
        message: "link graph contains a cycle",
      });
    } else if (!color.has(target)) {
      color.set(target, 1);
      stack.push({ record: target, next: 0 });
    }
  }
}
