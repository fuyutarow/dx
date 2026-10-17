import { test, expect } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { version } from "../package.json" with { type: "json" };
import { sha256 } from "../src/formats.ts";
import { dx, main, markdown, processRun, repo, snapshot, typeSource, write } from "./helpers.ts";

test("standalone policy loading survives removal of build sources and a PATH without Bun", async () => {
  const { cwd, base } = await repo();
  const temporary = await mkdtemp(join(tmpdir(), "dx-release-test-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  await verify(cwd, base, temporary);
}, 60000);

async function verify(cwd: string, base: string, temporary: string) {
  const source = join(temporary, "source");
  const root = join(main, "../..");
  await mkdir(source);
  await cp(join(root, "src"), join(source, "src"), { recursive: true });
  await cp(join(root, ".dx-preset"), join(source, ".dx-preset"), { recursive: true });
  await cp(join(root, "package.json"), join(source, "package.json"));
  await symlink(join(root, "node_modules"), join(source, "node_modules"));
  const binary = join(temporary, "dx");
  const compiled = await processRun(source, [
    process.execPath,
    "build",
    "--compile",
    "src/main.ts",
    "--outfile",
    binary,
  ]);
  expect(compiled.exit, compiled.stderr).toBe(0);
  await rm(source, { recursive: true, force: true });
  const path = join(temporary, "path");
  await mkdir(path);
  for (const tool of ["git", "jj"]) {
    const executable = Bun.which(tool);
    expect(executable).not.toBeNull();
    if (executable !== null) await symlink(executable, join(path, tool));
  }
  expect(Bun.which("bun", { PATH: path })).toBeNull();
  await write(
    cwd,
    ".dx/helpers/id.ts",
    `import { ok } from "neverthrow";
import { sha256 } from "dx";
export const id = (file: {fields: Record<string, unknown>}) => ok(sha256(String(file.fields.id)))._unsafeUnwrap();`,
  );
  await write(
    cwd,
    ".dx/note.ts",
    typeSource()
      .replace(
        'import { z } from "zod";',
        'import { z } from "zod"; import { id } from "./helpers/id";',
      )
      .replace("id: file => String(file.fields.id)", "id"),
  );
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  const rev = await snapshot(cwd);
  const args = ["check", "--base", base, rev];
  const expected = await dx(cwd, ...args);
  expect(expected.exit, expected.stderr).toBe(1);
  expect(expected.stdout).toContain('"check":"quality"');
  const env = { ...process.env, PATH: path, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" };
  const versionResult = await runBinary(binary, cwd, env, ["-V"]);
  expect(versionResult).toEqual({ stdout: `dx ${version}\n`, stderr: "", exit: 0 });
  const actual = await runBinary(binary, cwd, env, args);
  expect(actual).toEqual(expected);
  expect(sha256(actual.stdout)).toBe(sha256(expected.stdout));
}

async function runBinary(binary: string, cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  const child = Bun.spawn({
    cmd: [binary, ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
