import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { attempt, undetermined } from "./errors.ts";
import type { Layout } from "./layout.ts";

export const REVIEW_PASS = 0.5;
const positive = z.number().int().positive();
export const inputPatternsSchema = z.array(z.string().min(1)).default([]);
export const configSchema = z.strictObject({
  repo: z.strictObject({
    name: z.string().min(1),
    remote: z.string().min(1).default("origin"),
    branch: z.string().min(1).default("alpha"),
  }),
  review: z
    .strictObject({
      command: z.array(z.string().min(1)).min(1).optional(),
    })
    .prefault({}),
  limits: z
    .strictObject({
      record_bytes: positive.default(4194304),
      records: positive.default(200000),
      links_per_record: positive.default(10000),
    })
    .prefault({}),
  files: z
    .strictObject({
      ignore: z
        .array(z.string())
        .default(["records/raw/**", "tools/**", "README.md", "**/node_modules/**"]),
      inputs: inputPatternsSchema,
      strict: z.boolean().default(false),
    })
    .prefault({}),
});
export type Config = z.infer<typeof configSchema>;
export const SUPPORTED_EDITIONS = [1] as const;
/** Admit the edition before reading the payload. The legacy dx.toml has no selector and means edition 1. */
export function readConfig(text: string, layout: Layout) {
  return safeTry(function* () {
    const parsed = yield* attempt((): unknown => Bun.TOML.parse(text));
    const table = z.record(z.string(), z.unknown()).safeParse(parsed);
    if (!table.success) return undetermined(`${layout.config}: not a table`);
    const { edition, ...payload } = table.data;
    if (layout.legacy) {
      if (edition !== undefined)
        return undetermined(`${layout.config}: edition は semlint.toml にだけ書く`);
    } else if (edition === undefined)
      return undetermined(`${layout.config}: edition が無い。先頭に edition = 1 を書く`);
    else if (!SUPPORTED_EDITIONS.some((supported) => supported === edition))
      return undetermined(
        `${layout.config}: edition = ${JSON.stringify(edition)} は読めない（読めるのは ${SUPPORTED_EDITIONS.join(", ")}）`,
      );
    const result = configSchema.safeParse(payload);
    if (!result.success) return undetermined(`${layout.config}: ${result.error.message}`);
    return ok(result.data);
  });
}
