import { posix } from "node:path";
import { z } from "zod";
import type { Config } from "./config.ts";
import type { Snapshot } from "./collection.ts";
import { attempt, undetermined } from "./errors.ts";
import {
  findingInputSchema,
  verdictSchema,
  type FindingInput,
  type LoadedType,
  type RecordModel,
  type TreeContext,
} from "./model.ts";
import { matches } from "./policy.ts";
import { sha256, stableJson } from "./formats.ts";

export function context(snapshot: Snapshot, base: Snapshot): TreeContext {
  return Object.freeze({
    records: Object.freeze([...snapshot.records]),
    base: Object.freeze([...base.records]),
    files: Object.freeze({ ...snapshot.files }),
    read: (path: string) => snapshot.files[path],
  });
}
function groups(records: readonly RecordModel[]) {
  const result = new Map<string, RecordModel[]>();
  for (const record of records) {
    const values = result.get(record.id) ?? [];
    values.push(record);
    result.set(record.id, values);
  }
  return result;
}
export async function structural(
  snapshot: Snapshot,
  base: Snapshot,
  types: readonly LoadedType[],
): Promise<FindingInput[]> {
  const findings = [...snapshot.findings];
  const byId = groups(snapshot.records);
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
    const edges: RecordModel[] = [];
    graph.set(record, edges);
    const type = definitions.get(record.type);
    for (const link of record.links) {
      if (/^dx:[^/]+\/.+$/u.test(link.to)) continue; // §10 R-5: reserved external references.
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
      if (target.type !== type?.links[link.rel]?.to)
        findings.push({
          check: "I-04.type",
          id: record.id,
          path: record.path,
          field: `${link.rel}:${link.to}`,
          message: "link target has the wrong type",
        });
      edges.push(target);
    }
  }
  const color = new Map<RecordModel, number>();
  for (const record of snapshot.records) {
    if (color.has(record)) continue;
    const stack = [{ record, next: 0 }];
    color.set(record, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
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
  const tree = context(snapshot, base);
  for (const record of snapshot.records) {
    for (const check of definitions.get(record.type)?.checks ?? []) {
      const result = z.array(findingInputSchema).safeParse(await check(record, tree));
      if (!result.success) return undetermined(`invalid custom findings: ${result.error.message}`);
      findings.push(
        ...result.data.map((row) => ({
          check: row.check,
          path: row.path,
          message: row.message,
          id: row.id ?? record.id,
          ...(row.field === undefined ? {} : { field: row.field }),
        })),
      );
    }
  }
  return findings;
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
export function rubricPath(type: LoadedType): string {
  const raw = type.review?.rubric ?? undetermined(`no rubric for ${type.name}`);
  const path = posix.normalize(raw.startsWith(".dx/") ? raw : `.dx/${raw}`);
  if (!path.startsWith(".dx/")) return undetermined(`rubric must be in .dx/: ${raw}`);
  return path;
}
export function sidecarVerdicts(text: string, path: string): unknown[] {
  const parsed = attempt((): unknown => {
    if (path.endsWith(".toml")) return Bun.TOML.parse(text);
    return JSON.parse(text);
  });
  if (parsed.isOk()) {
    const container = z.object({ verdicts: z.array(z.unknown()) }).safeParse(parsed.value);
    if (container.success) return container.data.verdicts;
    return Array.isArray(parsed.value) ? parsed.value : [parsed.value];
  }
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const rows = lines.map((line) => attempt((): unknown => JSON.parse(line)));
  if (rows.some((row) => row.isErr())) return [];
  return rows.flatMap((row) => (row.isOk() ? [row.value] : []));
}
export function reviews(
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
  config: Config,
) {
  const findings: FindingInput[] = [];
  const previous = groups(base.records);
  for (const type of types) {
    if (type.review === undefined) continue;
    const rubric = rubricPath(type);
    const text = head.files[rubric] ?? undetermined(`rubric missing: ${rubric}`);
    const rubricHash = sha256(text);
    const hasPassingVerdict = verdictChecker(head, type, config, rubricHash);
    for (const record of head.records.filter((r) => r.type === type.name)) {
      const old = previous.get(record.id)?.[0];
      if (!reviewChanged(old, record, type)) continue;
      const valid = hasPassingVerdict(record);
      if (!valid)
        findings.push({
          check: "I-06.verdict",
          id: record.id,
          path: record.path,
          field: "review",
          message: "missing passing verdict bound to this record, rubric and another author",
        });
    }
  }
  return findings;
}

/** Shared by I-06 and review retries: one schema, binding and storage reader. */
export function verdictChecker(
  head: Snapshot,
  type: LoadedType,
  config: Config,
  rubricHash = sha256(head.files[rubricPath(type)] ?? undetermined("missing rubric")),
): (record: RecordModel) => boolean {
  const review = type.review ?? undetermined("missing review definition");
  const raw =
    review.place === "frontmatter"
      ? undefined
      : Object.entries(head.files)
          .filter(([path]) => matches(review.place.slice(5), path))
          .flatMap(([path, text]) => sidecarVerdicts(text, path));
  return (record) =>
    (raw ?? [record.fields.review]).some((value) => {
      const result = verdictSchema.safeParse(value);
      if (!result.success) return false;
      const v = result.data;
      return (
        v.id === record.id &&
        v.sha256 === record.sha256 &&
        v.rubric_sha256 === rubricHash &&
        (v.rubric === review.rubric || v.rubric === rubricPath(type)) &&
        v.pass &&
        reviewerAllowed(record.by, v.by) &&
        v.p.every((p) => p >= config.review.pass)
      );
    });
}

/** Match the I-06 target set, including edits to frontmatter verdict metadata. */
export function reviewChanged(
  old: RecordModel | undefined,
  record: RecordModel,
  type: LoadedType,
): boolean {
  return (
    old === undefined ||
    old.sha256 !== record.sha256 ||
    (type.review?.place === "frontmatter" &&
      stableJson(old.fields.review) !== stableJson(record.fields.review))
  );
}

/** I-06: unknown record authors require a machine reviewer; known authors must differ. */
export function reviewerAllowed(author: string | undefined, reviewer: string): boolean {
  return author === undefined ? reviewer.startsWith("process:") : reviewer !== author;
}
