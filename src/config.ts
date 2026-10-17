import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { attempt, undetermined } from "./errors.ts";

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
      command: z.array(z.string().min(1)).min(1).default(["agx", "jev"]),
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
export function readConfig(text: string) {
  return safeTry(function* () {
    const result = configSchema.safeParse(yield* attempt((): unknown => Bun.TOML.parse(text)));
    if (!result.success) return undetermined(`dx.toml: ${result.error.message}`);
    return ok(result.data);
  });
}
