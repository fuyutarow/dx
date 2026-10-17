import { type Finding, type FindingInput } from "./model.ts";
import { stableJson } from "./formats.ts";

/** Version 1 key: JSON tuple [check, id-or-null, field-or-empty-string]. */
export function findingKey(row: FindingInput): string {
  return JSON.stringify([row.check, row.id ?? null, row.field ?? ""]);
}
export function classify(head: readonly FindingInput[], base: readonly FindingInput[]): Finding[] {
  const existing = new Set(base.map((row) => findingKey(row)));
  const rows = new Map<string, FindingInput>();
  for (const row of [...head].toSorted((a, b) => {
    const left = stableJson(a);
    const right = stableJson(b);
    return left < right ? -1 : Number(left > right);
  }))
    rows.set(findingKey(row), row);
  return [...rows]
    .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([key, row]) => Object.assign({ v: 1 as const }, row, { key, new: !existing.has(key) }));
}
