import { cli } from "cleye";
import { mkdtemp, realpath, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { jsonOf, z } from "../.preset/zod.ts";
import { releasePlatforms } from "./release-platforms.ts";
import { renderFormula, releaseVersion, type FormulaAsset } from "./brew-formula.ts";

export type FinishRunner = (
  cmd: string[],
  cwd: string,
) => Promise<{ exit: number; stdout: string; stderr: string }>;
export const run: FinishRunner = async (cmd, cwd) => {
  let timeout = 120000;
  if (cmd[0] === "brew") timeout = 600000;
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
const formulaPath = "Formula/semlint.rb";
const tapRepo = "fuyutarow/homebrew-tap";
const formulaName = "fuyutarow/tap/semlint";
const contentSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u), content: z.string() });
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
      if (knownConsumers.has(entry.name) || (await Bun.file(join(root, "semlint.toml")).exists()))
        roots.add(root);
    }
    if (roots.size === 0) return err("no consumers found; supply --consumer directories");
    return ok([...roots].toSorted());
  });
}

async function updateFormula(repo: string, text: string, runner: FinishRunner) {
  return safeTry(async function* () {
    const endpoint = `repos/${tapRepo}/contents/${formulaPath}`;
    const getArgs = ["gh", "api", `${endpoint}?ref=alpha`];
    const response = yield* ResultAsync.fromPromise(runner(getArgs, repo), String);
    const missing = response.exit !== 0 && /\bHTTP 404\b/u.test(response.stderr);
    if (response.exit !== 0 && !missing)
      return err(
        `${JSON.stringify(getArgs)} exited ${response.exit}: ${(response.stderr + response.stdout).slice(0, 4096)}`,
      );
    const current = missing ? undefined : jsonOf(contentSchema).safeParse(response.stdout);
    if (current !== undefined && !current.success)
      return err("cannot decode the published common-tap formula");
    if (
      current === undefined ||
      (current.success && Buffer.from(current.data.content, "base64").toString("utf8") !== text)
    ) {
      // Contents API commits only this file to alpha; the blob SHA rejects concurrent edits.
      yield* await command(
        runner,
        [
          "gh",
          "api",
          "--method",
          "PUT",
          endpoint,
          "-f",
          "branch=alpha",
          ...(current?.success === true ? ["-f", `sha=${current.data.sha}`] : []),
          "-f",
          "message=release: update semlint formula",
          "-f",
          `content=${Buffer.from(text).toString("base64")}`,
          "--jq",
          ".commit.sha",
        ],
        repo,
      );
    }
    const published = jsonOf(contentSchema).safeParse(
      yield* await command(runner, ["gh", "api", `${endpoint}?ref=alpha`], repo),
    );
    if (
      !published.success ||
      Buffer.from(published.data.content, "base64").toString("utf8") !== text
    )
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
      yield* await command(runner, ["gh", "api", "repos/fuyutarow/semlint/releases/latest"], repo),
    );
    if (
      !release.success ||
      release.data.tag_name !== `v${version}` ||
      release.data.draft ||
      release.data.prerelease
    )
      return err(`v${version} is not the latest published stable release`);
    const stage = yield* ResultAsync.fromPromise(
      mkdtemp(join(tmpdir(), "semlint-formula-")),
      String,
    );
    await using cleanup = new AsyncDisposableStack();
    cleanup.defer(async () => {
      await rm(stage, { recursive: true, force: true });
    });
    const assets: FormulaAsset[] = [];
    for (const platform of releasePlatforms) {
      const name = `semlint-${version}-${platform}.tar.gz`;
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
          "fuyutarow/semlint",
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
    const workflow = [
      "gh",
      "workflow",
      "run",
      "update-formulas.yml",
      "-R",
      tapRepo,
      "-f",
      "tool=semlint",
    ];
    if (options.dryRun === true)
      return ok({
        version,
        consumers: roots,
        dryRun: true,
        formula,
        commands: [["brew", "update"], ["brew", "upgrade", formulaName], workflow],
      });
    progress("FORMULA: scoped commit and push");
    yield* await updateFormula(repo, formula, runner);
    progress("BREW_UPDATE");
    yield* await command(runner, ["brew", "update"], repo);
    const installed = yield* ResultAsync.fromPromise(
      runner(["brew", "list", "--formula", "--versions", formulaName], repo),
      String,
    );
    if (
      installed.exit !== 0 &&
      !(installed.exit === 1 && installed.stdout.trim() === "" && installed.stderr.trim() === "")
    )
      return err("cannot inspect the installed Homebrew semlint");
    const install =
      installed.exit === 0 ? ["brew", "upgrade", formulaName] : ["brew", "install", formulaName];
    progress(`BREW_INSTALL: ${install.join(" ")}`);
    yield* await command(runner, install, repo);
    yield* await command(runner, ["brew", "test", formulaName], repo);
    const keg = (yield* await command(runner, ["brew", "--prefix", formulaName], repo)).trim();
    const receipt = jsonOf(z.object({ source: z.object({ tap: z.string() }) })).safeParse(
      yield* ResultAsync.fromPromise(Bun.file(join(keg, "INSTALL_RECEIPT.json")).text(), String),
    );
    if (!receipt.success || receipt.data.source.tap !== "fuyutarow/tap")
      return err(`semlint is still installed from another tap; run brew reinstall ${formulaName}`);
    const prefix = (yield* await command(runner, ["brew", "--prefix"], repo)).trim();
    const expected = yield* ResultAsync.fromPromise(realpath(join(prefix, "bin/semlint")), String);
    for (const root of roots) {
      progress(`VERIFY_PATH: ${root}`);
      const selected = (yield* await command(
        runner,
        ["sh", "-c", "command -v semlint"],
        root,
      )).trim();
      const actual = yield* ResultAsync.fromPromise(realpath(selected), String);
      if (actual !== expected)
        return err(
          `PATH selects ${selected} instead of Homebrew semlint in ${root}; remove the retired mise/shim selection`,
        );
      const output = yield* await command(runner, ["semlint", "--version"], root);
      if (output.trim() !== `semlint ${version}`)
        return err(
          `consumer ${root} returned ${JSON.stringify(output.trim())}, expected semlint ${version}`,
        );
    }
    progress("FORMULA_WORKFLOW: update-formulas.yml tool=semlint");
    const dispatch = (yield* await command(runner, workflow, repo)).trim();
    if (dispatch !== "") progress(dispatch);
    return ok({
      version,
      consumers: roots,
      dryRun: false,
      tapRepo,
      formula: formulaPath,
      install,
      workflow: { command: workflow, dispatch },
    });
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
        description:
          "semlint checkout used for release commands (formula is published to homebrew-tap)",
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
  if (["brew", "gh"].some((tool) => Bun.which(tool) === null)) {
    process.stderr.write("FATAL: brew and gh must be on PATH\n");
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
