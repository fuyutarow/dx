import { z } from "zod";
import { undetermined } from "./errors.ts";

const positive = z.number().int().positive();
export const configSchema = z.strictObject({
  repo: z.strictObject({
    name: z.string().min(1),
    remote: z.string().min(1).default("origin"),
    branch: z.string().min(1).default("alpha"),
  }),
  review: z
    .strictObject({
      command: z.array(z.string().min(1)).min(1).default(["agx", "jev"]),
      pass: z.number().min(0).max(1).default(0.5),
    })
    .prefault({}),
  limits: z
    .strictObject({
      record_bytes: positive.default(4194304),
      records: positive.default(200000),
      links_per_record: positive.default(10000),
      check_seconds: z.number().positive().finite().default(120),
    })
    .prefault({}),
  files: z
    .strictObject({
      ignore: z.array(z.string()).default(["records/raw/**", "tools/**", "README.md"]),
      strict: z.boolean().default(false),
    })
    .prefault({}),
});
export type Config = z.infer<typeof configSchema>;
export function readConfig(text: string): Config {
  const result = configSchema.safeParse(Bun.TOML.parse(text));
  return result.success ? result.data : undetermined(`dx.toml: ${result.error.message}`);
}
