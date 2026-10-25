import { cli } from "cleye";
import { mkdir, mkdtemp, realpath, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { jsonOf, z } from "../.dx-preset/zod.ts";
import { releasePlatforms } from "./release-platforms.ts";
import { renderFormula, releaseVersion, type FormulaAsset } from "./brew-formula.ts";

export type FinishRunner = (
  cmd: string[],
  cwd: string,
) => Promise<{ exit: number; stdout: string; stderr: string }>;
export const run: FinishRunner = async (cmd, cwd) => {
  // A scoped formula commit runs the repository gate before it can publish.
  let timeout = 120000;
  if (cmd[0] === "brew") timeout = 600000;
  if (cmd[0] === "mise") timeout = 1200000;
  const signal = AbortSignal.timeout(timeout);
  const child = Bun.spawn({
    cmd,
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    env:
      cmd[0] === "brew" && cmd[1] !== "update"
        ? {
            ...process.env,
            HOMEBREW_NO_AUTO_UPDATE: "1",
            HOMEBREW_NO_INSTALL_CLEANUP: "1",
            HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: "1",
          }
        : process.env,
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr: signal.aborted ? stderr + "\ncommand timed out" : stderr };
};
async function command(runner: FinishRunner, args: string[], cwd: string) {
  return ResultAsync.fromPromise(runner(args, cwd), String).andThen((result) =>
    result.exit === 0
      ? ok(result.stdout)
      : err(
          `${JSON.stringify(args)} exited ${result.exit}: ${(result.stderr + result.stdout).slice(0, 4096)}`,
        ),
  );
}
const publishedSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(
    z.object({
      name: z.string(),
      id: z.number().int().positive(),
      size: z.number().int().positive(),
      digest: z.string().nullable().optional(),
    }),
  ),
});
const formulaPath = "Formula/dx.rb";
const knownConsumers = new Set([
  "firedancer",
  "pass1",
  "research-record-v2",
  "retrospectives",
  "soks",
]);

async function consumerRoots(workspace: string, explicit: readonly string[]) {
  return safeTry(async function* () {
    const roots = new Set(explicit.map((path) => resolve(path)));
    const entries = yield* ResultAsync.fromPromise(
      readdir(workspace, { withFileTypes: true }),
      String,
    );
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const root = join(workspace, entry.name);
      if (knownConsumers.has(entry.name) || (await Bun.file(join(root, "dx.toml")).exists()))
        roots.add(root);
    }
    if (roots.size === 0) return err("no consumers found; supply --consumer directories");
    return ok([...roots].toSorted());
  });
}

async function updateFormula(repo: string, text: string, runner: FinishRunner) {
  return safeTry(async function* () {
    const status = yield* await command(
      runner,
      ["git", "status", "--porcelain", "--untracked-files=all"],
      repo,
    );
    if (
      status
        .split("\n")
        .filter((line) => line !== "")
        .some((line) => line.slice(3) !== formulaPath)
    )
      return err("prepare a clean release workspace; only Formula/dx.rb may be dirty");
    const path = join(repo, formulaPath);
    const existing = (await Bun.file(path).exists())
      ? yield* ResultAsync.fromPromise(Bun.file(path).text(), String)
      : undefined;
    if (status.trim() !== "" && existing !== text)
      return err("unrelated Formula/dx.rb edits; do not overwrite them");
    if (existing !== text || status.trim() !== "") {
      const head = (yield* await command(runner, ["git", "rev-parse", "HEAD"], repo)).trim();
      const remote = (yield* await command(
        runner,
        ["git", "ls-remote", "origin", "refs/heads/alpha"],
        repo,
      )).split(/\s/u)[0];
      if (head !== remote)
        return err("release workspace must start at published alpha before updating the formula");
      yield* ResultAsync.fromPromise(mkdir(dirname(path), { recursive: true }), String);
      yield* ResultAsync.fromPromise(Bun.write(path, text), String);
      yield* await command(
        runner,
        [
          "mise",
          "run",
          "commit",
          "--",
          "-m",
          "release: update Homebrew dx formula",
          "--push",
          "--",
          formulaPath,
        ],
        repo,
      );
    }
    const encoded = yield* await command(
      runner,
      ["gh", "api", "repos/fuyutarow/dx/contents/Formula/dx.rb?ref=alpha", "--jq", ".content"],
      repo,
    );
    if (Buffer.from(encoded, "base64").toString("utf8") !== text)
      return err(
        "formula publication is incomplete; recover the scoped commit/push before machine installation",
      );
    return ok(undefined);
  });
}

export async function finishRelease(
  version: string,
  options: { repo: string; workspace: string; consumers?: readonly string[]; dryRun?: boolean },
  runner: FinishRunner = run,
  progress: (line: string) => void = (line) => process.stderr.write(line + "\n"),
) {
  return safeTry(async function* () {
    if (!releaseVersion.safeParse(version).success)
      return err("expected an explicit stable version such as 0.1.7");
    const repo = resolve(options.repo);
    const roots = yield* await consumerRoots(resolve(options.workspace), options.consumers ?? []);
    const release = jsonOf(publishedSchema).safeParse(
      yield* await command(runner, ["gh", "api", "repos/fuyutarow/dx/releases/latest"], repo),
    );
    if (
      !release.success ||
      release.data.tag_name !== `v${version}` ||
      release.data.draft ||
      release.data.prerelease
    )
      return err(`v${version} is not the latest published stable release`);
    const stage = yield* ResultAsync.fromPromise(mkdtemp(join(tmpdir(), "dx-formula-")), String);
    await using cleanup = new AsyncDisposableStack();
    cleanup.defer(async () => {
      await rm(stage, { recursive: true, force: true });
    });
    const assets: FormulaAsset[] = [];
    for (const platform of releasePlatforms) {
      const name = `dx-${version}-${platform}.tar.gz`;
      const matches = release.data.assets.filter((asset) => asset.name === name);
      const asset = matches[0];
      if (matches.length !== 1 || asset === undefined)
        return err(`missing or duplicate published archive: ${name}`);
      progress(`HASH_PUBLISHED: ${name}`);
      yield* await command(
        runner,
        [
          "gh",
          "release",
          "download",
          `v${version}`,
          "--repo",
          "fuyutarow/dx",
          "--pattern",
          name,
          "--dir",
          stage,
        ],
        repo,
      );
      const bytes = yield* ResultAsync.fromPromise(
        Bun.file(join(stage, name)).arrayBuffer(),
        String,
      );
      const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      if (
        bytes.byteLength !== asset.size ||
        (asset.digest !== undefined && asset.digest !== null && asset.digest !== `sha256:${sha256}`)
      )
        return err(`published archive size/digest mismatch: ${name}`);
      assets.push({ platform, id: asset.id, sha256 });
    }
    const formula = yield* renderFormula(version, assets);
    const tap = ["brew", "tap", "fuyutarow/dx", "https://github.com/fuyutarow/dx"];
    if (options.dryRun === true)
      return ok({
        version,
        consumers: roots,
        dryRun: true,
        formula,
        commands: [tap, ["brew", "update"], ["brew", "upgrade", "fuyutarow/dx/dx"]],
      });
    progress("FORMULA: scoped commit and push");
    yield* await updateFormula(repo, formula, runner);
    yield* await command(runner, tap, repo);
    progress("BREW_UPDATE");
    yield* await command(runner, ["brew", "update"], repo);
    const installed = yield* ResultAsync.fromPromise(
      runner(["brew", "list", "--formula", "--versions", "fuyutarow/dx/dx"], repo),
      String,
    );
    if (
      installed.exit !== 0 &&
      !(installed.exit === 1 && installed.stdout.trim() === "" && installed.stderr.trim() === "")
    )
      return err("cannot inspect the installed Homebrew dx");
    const install =
      installed.exit === 0
        ? ["brew", "upgrade", "fuyutarow/dx/dx"]
        : ["brew", "install", "fuyutarow/dx/dx"];
    progress(`BREW_INSTALL: ${install.join(" ")}`);
    yield* await command(runner, install, repo);
    yield* await command(runner, ["brew", "test", "fuyutarow/dx/dx"], repo);
    const prefix = (yield* await command(runner, ["brew", "--prefix"], repo)).trim();
    const expected = yield* ResultAsync.fromPromise(realpath(join(prefix, "bin/dx")), String);
    for (const root of roots) {
      progress(`VERIFY_PATH: ${root}`);
      const selected = (yield* await command(runner, ["sh", "-c", "command -v dx"], root)).trim();
      const actual = yield* ResultAsync.fromPromise(realpath(selected), String);
      if (actual !== expected)
        return err(
          `PATH selects ${selected} instead of Homebrew dx in ${root}; remove the retired mise/shim selection`,
        );
      const output = yield* await command(runner, ["dx", "-V"], root);
      if (output.trim() !== `dx ${version}`)
        return err(
          `consumer ${root} returned ${JSON.stringify(output.trim())}, expected dx ${version}`,
        );
    }
    return ok({ version, consumers: roots, dryRun: false, formula: formulaPath, install });
  });
}

function rejectPrototypeFlag(type: string, flag: string) {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("USAGE: unknown option --__proto__\n");
    process.exit(2);
  }
}
async function main() {
  const args = cli({
    name: "release-finish",
    parameters: ["<version>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: {
      repo: {
        type: String,
        description: "Clean release workspace for the scoped formula commit/push",
      },
      workspace: { type: String, description: "Parent directory of consumer repositories" },
      consumer: { type: [String], description: "Additional consumer directory (repeatable)" },
      dryRun: {
        type: Boolean,
        description:
          "Download/hash published assets and preview; no repo, brew or machine mutation",
      },
    },
  });
  if (args._.length !== 1) {
    process.stderr.write("USAGE: expected exactly one version\n");
    process.exitCode = 2;
    return;
  }
  if (["brew", "gh", "git", "mise"].some((tool) => Bun.which(tool) === null)) {
    process.stderr.write("FATAL: brew, gh, git and mise must be on PATH\n");
    process.exitCode = 2;
    return;
  }
  const root = resolve(args.flags.repo ?? join(import.meta.dir, ".."));
  const result = await finishRelease(args._.version, {
    repo: root,
    workspace: args.flags.workspace ?? dirname(root),
    consumers: args.flags.consumer ?? [],
    dryRun: args.flags.dryRun ?? false,
  });
  result.match(
    (value) =>
      process.stdout.write(
        `${value.dryRun ? "PLAN" : "RELEASE_COMPLETE"}: ${JSON.stringify(value)}\n`,
      ),
    (error) => {
      process.stderr.write(`RELEASE_INCOMPLETE: ${error}\n`);
      process.exitCode = 1;
    },
  );
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${String(error)}\n`);
    process.exitCode = 2;
  });
