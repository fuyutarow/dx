import { jsonOf } from "../.dx-preset/zod.ts";
import { validate, attemptAsync, undetermined } from "./errors.ts";
import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { invocationSchema } from "./cli.ts";
import { configSchema } from "./config.ts";

import { loadTypes } from "./policy.ts";
import { isolationFindings, readSnapshot, ruleFiles, snapshotCache } from "./collection.ts";
import { review } from "./commands/review.ts";
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
  exit: z.union([z.literal(0), z.literal(1), z.literal(3)]),
  stdout: z.string(),
  stderr: z.string(),
});
async function run() {
  return safeTry(async function* () {
    const input = yield* validate(jsonOf(requestSchema), await Bun.stdin.text());
    const { cwd, head, base, config, invocation } = input;
    const ms = Math.max(1, Math.ceil(config.limits.check_seconds * 1000));
    const deadline = setTimeout(() => {
      process.stderr.write("UNDETERMINED:limits.check_seconds exceeded\n");
      process.exit(4);
    }, ms);
    deadline.unref();
    const cache = snapshotCache(cwd, ms);
    const types = yield* await loadTypes(yield* await ruleFiles(cwd, head, ms, cache.reader));
    if (invocation.command === "schema")
      return ok({
        exit: 0,
        stdout: `${stableJson(yield* schema(types, invocation.name))}\n`,
        stderr: "",
      });
    const current = yield* await readSnapshot(cwd, head, config, types, ms, cache);
    if (
      invocation.command !== "check" &&
      invocation.command !== "review" &&
      current.findings.some((finding) => finding.check === "format")
    )
      return undetermined("record format could not be read; run dx check for findings");
    if (invocation.command === "review" && base !== undefined) {
      const previous = yield* await readSnapshot(cwd, base, config, types, ms, cache);
      const isolation = yield* await isolationFindings(
        cwd,
        base,
        head,
        config,
        types,
        ms,
        cache.reader,
      );
      // Review commands have their own 120-second deadline per record.
      clearTimeout(deadline);
      return ok(
        yield* await review(cwd, previous, current, types, config, isolation, (waiting) => {
          process.stderr.write(
            waiting ? "DX_INTERNAL_REVIEW_WAIT\n" : "DX_INTERNAL_REVIEW_READY\n",
          );
        }),
      );
    }
    if (invocation.command === "check" && base !== undefined) {
      const previous = yield* await readSnapshot(cwd, base, config, types, ms, cache);
      const findings = yield* await check(
        previous,
        current,
        types,
        config,
        yield* await isolationFindings(cwd, base, head, config, types, ms, cache.reader),
      );
      const count = findings.filter((f) => f.new).length;
      return ok({
        exit: count > 0 ? 1 : 0,
        stdout:
          findings.map((finding) => stableJson(finding)).join("\n") +
          (findings.length > 0 ? "\n" : ""),
        stderr: `${count > 0 ? "FINDINGS: " : ""}新しい finding ${count} 件 / 既存 ${findings.length - count} 件\n`,
      });
    }
    const viewName = invocation.list ? undefined : invocation.name;
    const rows =
      invocation.command === "ls"
        ? listRecords(current)
        : yield* await view(types, current, viewName);
    return ok({
      exit: 0,
      stdout: rows.map((row) => stableJson(row)).join("\n") + (rows.length > 0 ? "\n" : ""),
      stderr: "",
    });
  });
}
if (import.meta.main) {
  const result = await attemptAsync(run).andThen((value) => value);
  if (result.isErr()) {
    process.stderr.write(`UNDETERMINED:${result.error.replaceAll("\n", " ")}\n`);
    process.exitCode = 4;
  } else process.stdout.write(JSON.stringify(result.value));
}
