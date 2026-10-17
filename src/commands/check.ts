import { structural, transitions, reviews } from "../checks.ts";
import { classify } from "../findings.ts";
import type { Snapshot } from "../collection.ts";
import type { Config } from "../config.ts";
import type { FindingInput, LoadedType } from "../model.ts";

/** The common check(base, head) surface that land can call later. */
export async function check(
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
  config: Config,
  isolation: readonly FindingInput[],
) {
  const oldFindings = await structural(base, base, types);
  const findings = [
    ...(await structural(head, base, types)),
    ...transitions(base, head, types),
    ...reviews(base, head, types, config),
    ...isolation,
  ];
  return classify(findings, oldFindings);
}
