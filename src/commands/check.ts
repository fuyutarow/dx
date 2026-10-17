import { ok, safeTry } from "neverthrow";
import { structural, transitions, reviews } from "../checks.ts";
import { classify } from "../findings.ts";
import type { Snapshot } from "../collection.ts";
import type { FindingInput, LoadedType } from "../model.ts";

/** The common check(base, head) surface that land can call later. */
export async function check(
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
  isolation: readonly FindingInput[],
) {
  return safeTry(async function* () {
    const previous = new Map<string, Set<string>>();
    for (const record of base.records) {
      const hashes = previous.get(record.id) ?? new Set<string>();
      hashes.add(record.sha256);
      previous.set(record.id, hashes);
    }
    const changedIds = new Set(
      head.records
        .filter((record) => previous.get(record.id)?.has(record.sha256) !== true)
        .map((record) => record.id),
    );
    const oldFindings = yield* await structural(base, base, types);
    const findings = [
      ...(yield* await structural(head, base, types)),
      ...transitions(base, head, types),
      ...(yield* reviews(base, head, types)),
      ...isolation,
    ];
    // A rejected file has no record id/hash. Grandfather its format finding only
    // while its bytes stay identical, so editing malformed YAML cannot bypass I-02.
    const retained = oldFindings.filter(
      (row) => row.check !== "format" || base.files[row.path] === head.files[row.path],
    );
    return ok(classify(findings, retained, changedIds));
  });
}
