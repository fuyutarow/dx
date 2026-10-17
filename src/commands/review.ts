import { jsonOf } from "../../.dx-preset/zod.ts";
import { resultOf, validate, requireValue, attemptAsync, undetermined } from "../errors.ts";

import { ok, safeTry } from "neverthrow";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { check } from "./check.ts";
import {
  context,
  verdictChecker,
  rubricPath,
  sidecarVerdicts,
  reviewChanged,
  reviewerAllowed,
} from "../checks.ts";
import type { Snapshot } from "../collection.ts";
import type { Config } from "../config.ts";

import { parseRecords, formatAdapter, sha256, stableJson } from "../formats.ts";
import {
  verdictSchema,
  type FindingInput,
  type LoadedType,
  type RecordModel,
  type SourceFile,
  type FormatAdapter,
  type Verdict,
} from "../model.ts";
import { matches } from "../policy.ts";
import {
  assembleBits,
  assembleRequest,
  jevResponseSchema,
  parseRubric,
} from "../review-request.ts";

async function writablePath(cwd: string, path: string) {
  const target = resolve(cwd, path);
  const rel = relative(cwd, target);
  if (rel === "" || rel.startsWith("..") || rel.startsWith("/"))
    return undetermined(`review output escapes repository: ${path}`);
  for (const [index] of rel.split("/").entries()) {
    const stat = await attemptAsync(() => lstat(join(cwd, ...rel.split("/").slice(0, index + 1))));
    if (stat.isOk() && stat.value.isSymbolicLink())
      return undetermined(`review output uses symlink: ${path}`);
  }
  return ok(target);
}
export async function runReviewCommand(
  cwd: string,
  command: readonly string[],
  request: unknown,
  timeoutMs = 120000,
) {
  const result = await attemptAsync(async () => {
    const signal = AbortSignal.timeout(timeoutMs);
    const waiting = setTimeout(() => {
      process.stderr.write("dx: waiting for jev…\n");
    }, 2000);
    const posted = await attemptAsync(async () => {
      const child = Bun.spawn({
        cmd: [...command],
        cwd,
        stdin: new Blob([JSON.stringify(request)]),
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exit };
    });
    clearTimeout(waiting);
    if (posted.isErr()) return { error: posted.error };
    if (signal.aborted) return { error: `review command timed out after ${timeoutMs}ms` };
    if (posted.value.exit !== 0)
      return {
        error: `review command exited ${posted.value.exit}: ${posted.value.stderr.slice(0, 16000)}`,
      };
    const parsed = jsonOf(jevResponseSchema).safeParse(posted.value.stdout);
    if (!parsed.success) return { error: `invalid Jev response: ${parsed.error.message}` };
    return { response: parsed.data };
  });
  return result.isOk() ? result.value : { error: result.error };
}
function outputPath(place: string, record: RecordModel) {
  const pattern = place.slice(5);
  const path = pattern.replaceAll(/\*\*?/gu, () =>
    encodeURIComponent(record.id).replaceAll(".", "%2E"),
  );
  if (!matches(pattern, path)) return undetermined(`cannot derive review output path: ${pattern}`);
  return ok(path);
}
export async function review(
  cwd: string,
  base: Snapshot,
  head: Snapshot,
  types: readonly LoadedType[],
  config: Config,
  isolation: readonly FindingInput[],
  onWait: (waiting: boolean) => void = () => {},
) {
  return safeTry(async function* () {
    const checked = yield* await check(base, head, types, config, isolation);
    const findings = checked.filter((f) => f.check !== "I-06.verdict");
    const previous = new Map(base.records.map((r) => [r.id, r]));
    const plans = [];
    const rows: unknown[] = [];
    const blocked = new Set<FindingInput>();
    const tree = context(head, base);
    const passing = new Map<string, (record: RecordModel) => boolean>();
    for (const type of types.filter((t) => t.review !== undefined))
      passing.set(type.name, yield* verdictChecker(head, type, config));
    // Preflight every immutable request before starting external work.
    for (const record of head.records) {
      const type = types.find((t) => t.name === record.type);
      if (type?.review === undefined || !reviewChanged(previous.get(record.id), record, type))
        continue;
      const problems = findings.filter((f) => f.path === record.path || f.id === record.id);
      if (problems.length > 0) {
        problems.forEach((finding) => {
          blocked.add(finding);
        });
        continue;
      }
      if (passing.get(type.name)?.(record) === true) continue;
      const source = yield* requireValue(head.sources.get(record), "missing review source");
      const adapter = formatAdapter(type.format);
      if (type.review.place === "frontmatter" && adapter.writeReview === undefined)
        return undetermined(`format does not support frontmatter review: ${type.name}`);
      const rubricText = yield* requireValue(head.files[yield* rubricPath(type)], "missing rubric");
      const rubric = yield* parseRubric(rubricText);
      const evidence = yield* validate(
        z.array(
          z.object({
            locator: z.string(),
            status: z.string(),
            content: z.string().optional(),
            original_bytes: z.number().int().nonnegative().optional(),
            supplied_bytes: z.number().int().nonnegative().optional(),
          }),
        ),
        adapter.evidence?.(source, tree) ?? [],
      );
      const request = yield* assembleRequest(
        yield* resultOf(adapter.reviewText(source)),
        rubric,
        evidence,
      );
      const path =
        type.review.place === "frontmatter"
          ? record.path
          : yield* outputPath(type.review.place, record);
      const target = yield* await writablePath(cwd, path);
      const original = await attemptAsync(() => Bun.file(target).text());
      const expected = head.files[path];
      if ((original.isOk() ? original.value : undefined) !== expected)
        return undetermined(`working copy differs from REV: ${path}`);
      if (
        type.review.place !== "frontmatter" &&
        expected !== undefined &&
        expected.trim() !== "" &&
        (sidecarVerdicts(expected, path).length === 0 ||
          sidecarVerdicts(expected, path).some((v) => !verdictSchema.safeParse(v).success))
      )
        return undetermined(`invalid existing sidecar verdicts: ${path}`);
      // Sidecar writes must also bind to the selected working-copy record.
      if (type.review.place !== "frontmatter") {
        yield* await unchangedRecord(cwd, record, source, "differs from REV");
      }
      plans.push({ record, type, source, adapter, rubric, rubricText, request, path, target });
    }
    rows.push(...blocked);
    // A format failure has no model row, but is still an I-10 refusal.
    for (const finding of findings.filter(
      (f) =>
        f.check === "format" &&
        head.files[f.path] !== base.files[f.path] &&
        types.some((t) => t.review !== undefined && matches(t.match, f.path)),
    ))
      if (!blocked.has(finding)) rows.push(finding);
    let exit: 0 | 1 | 3 = rows.length > 0 ? 1 : 0;
    const contents = new Map<string, string | undefined>();
    for (const plan of plans) {
      const { record, type, source, adapter, rubric, rubricText, request, path, target } = plan;
      onWait(true);
      const posted = await runReviewCommand(cwd, config.review.command, request);
      onWait(false);
      const response = posted.response;
      const p =
        response === undefined ? [] : rubric.criteria.map((c) => response.answers[c.id]?.noul);
      const probabilities = z
        .array(z.number().min(0).max(1))
        .length(rubric.criteria.length)
        .safeParse(p);
      if (response === undefined || !probabilities.success) {
        exit = 3;
        process.stderr.write(
          `REVIEW_UNAVAILABLE: ${record.path}: ${(posted.error ?? "Jev omitted a criterion").replaceAll("\n", " ")}\n`,
        );
        continue;
      }
      const passed = probabilities.data.map((value) => value >= config.review.pass);
      const verdict = yield* validate(verdictSchema, {
        v: 1,
        id: record.id,
        sha256: record.sha256,
        rubric: type.review?.rubric,
        rubric_sha256: sha256(rubricText),
        by: `process:jev/${response.model}`,
        at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
        bits: assembleBits(passed),
        p: probabilities.data,
        pass: passed.every(Boolean),
      });
      if (!reviewerAllowed(record.by, verdict.by))
        return undetermined(`review author must differ from record author: ${record.id}`);
      const expected = contents.has(path) ? contents.get(path) : head.files[path];
      const actual = await attemptAsync(() => Bun.file(target).text());
      if ((actual.isOk() ? actual.value : undefined) !== expected)
        return undetermined(`working copy changed during review: ${path}`);
      const output = yield* await reviewContent(
        cwd,
        record,
        type,
        source,
        adapter,
        verdict,
        path,
        expected,
      );
      await mkdir(dirname(target), { recursive: true });
      await realpath(dirname(target)); // Surface I/O errors before the write.
      await Bun.write(yield* await writablePath(cwd, path), output);
      contents.set(path, output);
      rows.push(verdict);
      if (!verdict.pass && exit === 0) exit = 1;
    }
    return ok({
      exit,
      stdout: rows.map((row) => stableJson(row)).join("\n") + (rows.length > 0 ? "\n" : ""),
      stderr: exit === 1 ? "FINDINGS: review に不合格または構造の finding があります\n" : "",
    });
  });
}

async function unchangedRecord(
  cwd: string,
  record: RecordModel,
  source: SourceFile,
  reason: string,
) {
  return safeTry(async function* () {
    const sourcePath = yield* await writablePath(cwd, record.path);
    if ((await Bun.file(sourcePath).text()) !== source.text)
      return undetermined(`working copy ${reason}: ${record.path}`);
    return ok(undefined);
  });
}
async function reviewContent(
  cwd: string,
  record: RecordModel,
  type: LoadedType,
  source: SourceFile,
  adapter: FormatAdapter,
  verdict: Verdict,
  path: string,
  expected: string | undefined,
) {
  return safeTry(async function* () {
    let output: string;
    if (type.review?.place === "frontmatter") {
      const currentSource = yield* requireValue(
        (yield* parseRecords(path, expected ?? "", adapter))[source.index],
        "review source disappeared",
      );
      output = yield* resultOf(
        yield* requireValue(adapter.writeReview?.(currentSource, verdict), "missing review writer"),
      );
      const updated = yield* requireValue(
        (yield* parseRecords(path, output, adapter))[source.index],
        "review round trip failed",
      );
      if (
        adapter.hash(updated) !== record.sha256 ||
        stableJson(updated.fields.review) !== stableJson(verdict)
      )
        return undetermined("review writer changed record hash or verdict");
    } else {
      if ((await Bun.file(yield* await writablePath(cwd, record.path)).text()) !== source.text)
        return undetermined(`working copy changed during review: ${record.path}`);
      const existing = expected === undefined ? [] : sidecarVerdicts(expected, path);
      const verdicts = [
        ...existing.filter((v) => !z.object({ id: z.literal(record.id) }).safeParse(v).success),
        verdict,
      ];
      output = yield* serializeVerdicts(path, verdicts);
    }

    return ok(output);
  });
}

function serializeVerdicts(path: string, verdicts: unknown[]) {
  return safeTry(function* () {
    if (!path.endsWith(".toml")) return ok(JSON.stringify(verdicts) + "\n");
    const tables: string[] = [];
    for (const verdict of verdicts) {
      const checked = yield* validate(verdictSchema, verdict);
      tables.push(
        "[[verdicts]]\n" +
          Object.entries(checked)
            .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
            .join("\n"),
      );
    }
    return ok(tables.join("\n\n") + "\n");
  });
}
