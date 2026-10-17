import { z } from "zod";
import { invocationSchema } from "./cli.ts";
import { configSchema } from "./config.ts";
import { attemptAsync, undetermined } from "./errors.ts";
import { loadTypes } from "./policy.ts";
import { isolationFindings, readSnapshot, ruleFiles } from "./collection.ts";
import { check } from "./commands/check.ts";
import { listRecords } from "./commands/ls.ts";
import { schema } from "./commands/schema.ts";
import { view } from "./commands/view.ts";
import { stableJson } from "./formats.ts";

export const requestSchema = z.object({
  cwd: z.string(),
  head: z.string(),
  base: z.string().optional(),
  invocation: invocationSchema,
  config: configSchema,
});
export const responseSchema = z.object({
  exit: z.union([z.literal(0), z.literal(1)]),
  stdout: z.string(),
  stderr: z.string(),
});
async function run() {
  const input = requestSchema.parse(await Bun.stdin.json());
  const { cwd, head, base, config, invocation } = input;
  const ms = Math.max(1, Math.ceil(config.limits.check_seconds * 1000));
  const types = await loadTypes(await ruleFiles(cwd, head, ms));
  if (invocation.command === "schema")
    return {
      exit: 0,
      stdout: `${stableJson(schema(types, invocation.name))}\n`,
      stderr: "",
    };
  const current = await readSnapshot(cwd, head, config, types, ms);
  if (
    invocation.command !== "check" &&
    current.findings.some((finding) => finding.check === "format")
  )
    return undetermined("record format could not be read; run dx check for findings");
  if (invocation.command === "check" && base !== undefined) {
    const previous = await readSnapshot(cwd, base, config, types, ms);
    const findings = await check(
      previous,
      current,
      types,
      config,
      await isolationFindings(cwd, base, head, config, types, ms),
    );
    const count = findings.filter((f) => f.new).length;
    return {
      exit: count > 0 ? 1 : 0,
      stdout: findings.map(stableJson).join("\n") + (findings.length > 0 ? "\n" : ""),
      stderr: `${count > 0 ? "FINDINGS: " : ""}新しい finding ${count} 件 / 既存 ${findings.length - count} 件\n`,
    };
  }
  const rows =
    invocation.command === "ls"
      ? listRecords(current)
      : await view(types, current, invocation.list ? undefined : invocation.name);
  return {
    exit: 0,
    stdout: rows.map(stableJson).join("\n") + (rows.length > 0 ? "\n" : ""),
    stderr: "",
  };
}
if (import.meta.main) {
  const result = await attemptAsync(run);
  if (result.isErr()) {
    process.stderr.write(`UNDETERMINED:${result.error.replaceAll("\n", " ")}\n`);
    process.exitCode = 4;
  } else process.stdout.write(JSON.stringify(result.value));
}
