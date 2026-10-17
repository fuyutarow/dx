import { type Finding, type FindingInput } from "./model.ts";
import { stableJson } from "./formats.ts";

/** Version 1 key: JSON tuple [check, id-or-null-or-sorted-ids, field-or-empty-string]. */
export function findingKey(row: FindingInput): string {
  const subject = row.ids === undefined ? (row.id ?? null) : [...new Set(row.ids)].toSorted();
  return JSON.stringify([row.check, subject, row.field ?? ""]);
}
export function classify(
  head: readonly FindingInput[],
  base: readonly FindingInput[],
  changedIds: ReadonlySet<string>,
  changedPaths: ReadonlySet<string>,
): Finding[] {
  const existing = new Set(base.map((row) => findingKey(row)));
  const rows = new Map<string, FindingInput>();
  for (const input of [...head].toSorted((a, b) => {
    const left = stableJson(a);
    const right = stableJson(b);
    return left < right ? -1 : Number(left > right);
  })) {
    const row =
      input.ids === undefined ? input : { ...input, ids: [...new Set(input.ids)].toSorted() };
    rows.set(findingKey(row), row);
  }
  return [...rows]
    .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([key, row]) =>
      Object.assign({ v: 1 as const }, row, {
        key,
        new:
          !existing.has(key) ||
          changedPaths.has(row.path) ||
          (row.id !== undefined && changedIds.has(row.id)) ||
          (row.ids?.some((id) => changedIds.has(id)) ?? false),
      }),
    );
}
