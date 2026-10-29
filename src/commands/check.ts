import { ok, safeTry } from "neverthrow";
import { structural, transitions, reviews, reviewPlacePolicy } from "../checks.ts";
import { classify } from "../findings.ts";
import type { Snapshot } from "../collection.ts";
import type { FindingInput, LoadedType } from "../model.ts";

/** The common check(base, head) surface that admit calls. */
export async function check(
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
  isolation: readonly FindingInput[],
  inputs?: readonly string[],
) {
  return safeTry(async function* () {
    yield* reviewPlacePolicy(types, head.files, inputs);
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
    // Records are judged by their own hash (changedIds); a file that yields no
    // record (inputs, policy, an unparsable record file) is judged by its bytes.
    const recordFiles = new Set(head.records.map((record) => record.path));
    const changedPaths = new Set(
      [...new Set([...base.fileIds.keys(), ...head.fileIds.keys()])].filter(
        (path) => !recordFiles.has(path) && base.fileIds.get(path) !== head.fileIds.get(path),
      ),
    );
    const oldFindings = yield* await structural(base, base, types);
    const findings = [
      ...(yield* await structural(head, base, types)),
      ...transitions(base, head, types),
      ...(yield* reviews(base, head, types)),
      ...isolation,
    ];
    return ok(classify(findings, oldFindings, changedIds, changedPaths));
  });
}
