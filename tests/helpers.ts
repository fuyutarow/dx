import { jsonOf, z } from "../.dx-preset/zod.ts";
import type { Result } from "neverthrow";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { expect, afterEach } from "bun:test";
import { fieldsSchema } from "../src/model.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
export const main = join(import.meta.dir, "../src/main.ts");
export async function processRun(cwd: string, cmd: string[], milliseconds = 20000) {
  const signal = AbortSignal.timeout(milliseconds);
  const child = Bun.spawn({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal,
    killSignal: "SIGKILL",
    env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(signal.aborted).toBe(false);
  return { stdout, stderr, exit };
}
export const dx = async (cwd: string, ...args: string[]) => {
  const result = await processRun(cwd, [process.execPath, main, ...args]);
  if (process.env.DX_PRINT_RECEIPTS === "1")
    process.stderr.write(`${JSON.stringify({ cmd: ["dx", ...args], ...result })}\n`);
  return result;
};
export async function jj(cwd: string, ...args: string[]) {
  const result = await processRun(cwd, [
    "jj",
    "--config",
    'user.name="DX Test"',
    "--config",
    'user.email="dx@example.test"',
    ...args,
  ]);
  expect(result.exit, result.stderr).toBe(0);
  return result.stdout.trim();
}
export async function write(cwd: string, path: string, text: string) {
  await mkdir(dirname(join(cwd, path)), { recursive: true });
  await Bun.write(join(cwd, path), text);
}
export function typeSource(
  options: { immutable?: boolean; review?: string; format?: string } = {},
) {
  return `import { defineType } from "dx";
import { z } from "zod";
export default defineType({
  name: "note", match: "records/*.${options.format === "toml" ? "toml" : "md"}",
  format: ${JSON.stringify(options.format ?? "markdown-frontmatter")},
  id: file => String(file.fields.id),
  schema: z.looseObject({ id: z.string(), title: z.string().min(1) }),
  links: { next: { to: "note" } }, immutable: ${options.immutable ?? false},
  checks: [(record) => record.fields.bad === true ? [{ check: "quality", id: record.id,
    path: record.path, field: "bad", message: "bad record" }] : []],
  ${options.review === undefined ? "" : `review: { rubric: "rubrics/r.toml", place: ${JSON.stringify(options.review)} },`}
  views: { index: tree => tree.records.map(r => ({ id: r.id, title: r.fields.title })) },
});`;
}
export const markdown = (id: string, extra = "", body = "Body\n") =>
  `---\nid: ${JSON.stringify(id)}\ntitle: Title\nby: author\n${extra}---\n${body}`;
export async function snapshot(cwd: string) {
  await jj(cwd, "status");
  return jj(cwd, "--ignore-working-copy", "log", "--no-graph", "-r", "@", "-T", "commit_id");
}
export async function advance(cwd: string) {
  const base = await snapshot(cwd);
  await jj(cwd, "new", "-m", "next");
  return base;
}
export async function repo(options: Parameters<typeof typeSource>[0] = {}, config = "") {
  const cwd = await mkdtemp(join(tmpdir(), "dx-test-"));
  directories.push(cwd);
  await jj(cwd, "git", "init", "--colocate");
  await write(cwd, "dx.toml", `[repo]\nname = "fixture"\n${config}`);
  await write(cwd, ".dx/note.ts", typeSource(options));
  if (options.review !== undefined) await write(cwd, ".dx/rubrics/r.toml", 'rubric = "r"\n');
  const base = await advance(cwd);
  return { cwd, base };
}
export function rows(stdout: string) {
  return stdout.trim() === ""
    ? []
    : stdout
        .trim()
        .split("\n")
        .map((line) => decode(fieldsSchema, line));
}
export async function checked(cwd: string, base: string, expected: number) {
  await snapshot(cwd);
  const result = await dx(cwd, "check", "--base", base);
  expect(result.exit, result.stderr).toBe(expected);
  const findings = rows(result.stdout);
  for (const finding of findings) {
    expect(finding.v).toBe(1);
    expect(typeof finding.key).toBe("string");
  }
  return { ...result, findings };
}

export function value<T>(result: Result<T, string>): T {
  return result.match(
    (data) => data,
    (error) => expect.unreachable(error),
  );
}
export function expectError<T>(result: Result<T, string>, expected: string): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) expect(result.error).toContain(expected);
}

export function decode<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  const parsed = jsonOf(schema).safeParse(text);
  return parsed.success ? parsed.data : expect.unreachable(parsed.error.message);
}
export async function spawn(cmd: string[], options: { cwd: string }) {
  const child = Bun.spawn(cmd, { ...options, stdout: "pipe", stderr: "pipe", timeout: 20000 });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}
