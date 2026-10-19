import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { attempt, validate, undetermined } from "./errors.ts";
import type { Evidence } from "./model.ts";

export const REVIEW_INPUT_LIMIT_BYTES = 30_000;
export const rubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string().min(1),
        bit: z.number().int().nonnegative().optional(),
        question: z.string().min(1),
      }),
    )
    .min(1)
    .max(53),
});
export function parseRubric(text: string) {
  return safeTry(function* () {
    const rubric = yield* validate(
      rubricSchema,
      yield* attempt((): unknown => Bun.TOML.parse(text)),
    );
    if (
      new Set(rubric.criteria.map((c) => c.id)).size !== rubric.criteria.length ||
      rubric.criteria.some((c, index) => c.bit !== undefined && c.bit !== index)
    )
      return undetermined("rubric IDs must be unique and bits contiguous in rubric order");
    return ok(rubric);
  });
}
export function capEvidence(file: Evidence, cap: number): Evidence {
  if (file.content === undefined) return file;
  const bytes = Buffer.from(file.content).subarray(0, file.supplied_bytes ?? undefined);
  const total = file.original_bytes ?? bytes.length;
  if (total <= cap) return file;
  let end = Math.min(cap, bytes.length);
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return {
    ...file,
    original_bytes: total,
    supplied_bytes: end,
    content: `${bytes.subarray(0, end).toString("utf8")}\n[truncated at ${end} of ${total} bytes]`,
  };
}
export function fitEvidence(files: readonly Evidence[], budget: number) {
  let low = 0;
  let high = REVIEW_INPUT_LIMIT_BYTES / 4;
  let fitted: Evidence[] | undefined;
  while (low <= high) {
    const cap = Math.floor((low + high) / 2);
    const candidate = files.map((file) => capEvidence(file, cap));
    if (Buffer.byteLength(JSON.stringify(candidate)) <= budget) {
      fitted = candidate;
      low = cap + 1;
    } else high = cap - 1;
  }
  return fitted;
}
export const assembleBits = (values: readonly boolean[]) =>
  values.reduce((bits, value, bit) => bits + (value ? 2 ** bit : 0), 0);
