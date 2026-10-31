import { cli } from "cleye";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { jsonOf, z } from "../.preset/zod.ts";
import { version } from "../package.json" with { type: "json" };
import { run, type FinishRunner } from "./release-finish.ts";
import { releasePlatforms } from "./release-platforms.ts";

// CI consumer (release.yml): build, draft, upload, verify, then publish one tag.
const viewSchema = z.object({
  assets: z.array(
    z.object({
      name: z.string(),
      state: z.string(),
      size: z.number().int(),
      digest: z.string().nullable().optional(),
    }),
  ),
});

function failure(args: string[], result: { exit: number; stdout: string; stderr: string }) {
  return `${JSON.stringify(args)} exited ${result.exit}: ${(result.stderr + result.stdout).slice(0, 4096)}`;
}

/** Ok with the succeeding attempt, or every attempt's failure after three attempts. */
async function uploadWithRetry(
  runner: FinishRunner,
  root: string,
  args: (retry: boolean) => string[],
) {
  const failures: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await runner(args(attempt > 1), root);
    if (result.exit === 0) return ok(attempt);
    failures.push(`attempt ${attempt}: ${failure(args(attempt > 1), result)}`);
  }
  return err(failures.join("\n"));
}

export async function publishRelease(
  tag: string,
  root: string,
  runner: FinishRunner = run,
  packageVersion = version,
) {
  return safeTry(async function* () {
    if (tag !== `v${packageVersion}`)
      return err(`tag ${tag} does not match package.json version ${packageVersion}`);
    const built = yield* ResultAsync.fromPromise(
      runner(["bun", "scripts/release-build.ts"], root),
      String,
    );
    if (built.exit !== 0) return err(failure(["bun", "scripts/release-build.ts"], built));
    const assets = [];
    for (const platform of releasePlatforms) {
      const name = `semlint-${packageVersion}-${platform}.tar.gz`;
      const archive = join(root, "dist", name);
      const bytes = yield* ResultAsync.fromPromise(Bun.file(archive).arrayBuffer(), String);
      const size = yield* ResultAsync.fromPromise(stat(archive), String).map((s) => s.size);
      const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      assets.push({ name, archive, size, sha256 });
    }
    const create = ["gh", "release", "create", tag, "--draft", "--verify-tag", "--generate-notes"];
    const upload = (archive: string, retry: boolean) => {
      const args = ["gh", "release", "upload", tag, archive];
      return retry ? [...args, "--clobber"] : args;
    };
    const view = ["gh", "release", "view", tag, "--json", "assets"];
    const edit = ["gh", "release", "edit", tag, "--draft=false", "--latest"];
    const recovery = [
      `Recover the existing draft ${tag}; do not re-create the release or rerun this job:`,
      ...assets.map((asset) => upload(asset.archive, true).join(" ")),
      view.join(" "),
      `Check every asset is uploaded with these byte sizes: ${assets.map((a) => `${a.name}=${a.size}`).join(", ")}. Only then run:`,
      edit.join(" "),
    ].join("\n");
    const created = yield* ResultAsync.fromPromise(runner(create, root), String);
    // An existing release also lands here: recovery never re-creates it.
    if (created.exit !== 0)
      return err(`${failure(create, created)}\nCreation may have left a draft.\n${recovery}`);
    for (const asset of assets) {
      yield* (await uploadWithRetry(runner, root, (retry) => upload(asset.archive, retry))).mapErr(
        (failures) =>
          `upload failed for ${asset.name}; draft ${tag} retained\n${failures}\n${recovery}`,
      );
    }
    const inspected = yield* ResultAsync.fromPromise(runner(view, root), String);
    const remote = jsonOf(viewSchema).safeParse(inspected.stdout);
    if (inspected.exit !== 0 || !remote.success)
      return err(
        `cannot verify assets; draft ${tag} retained\n${failure(view, inspected)}\n${recovery}`,
      );
    for (const asset of assets) {
      const matches = remote.data.assets.filter((entry) => entry.name === asset.name);
      const found = matches[0];
      if (
        matches.length !== 1 ||
        found?.state !== "uploaded" ||
        found.size !== asset.size ||
        (found.digest !== null &&
          found.digest !== undefined &&
          found.digest !== `sha256:${asset.sha256}`)
      )
        return err(
          `asset ${asset.name} expected uploaded, ${asset.size} bytes, sha256:${asset.sha256}; got ${JSON.stringify(matches)}; draft ${tag} retained\n${recovery}`,
        );
    }
    const published = yield* ResultAsync.fromPromise(runner(edit, root), String);
    if (published.exit !== 0)
      return err(
        `assets verified but publication failed\n${failure(edit, published)}\n${recovery}`,
      );
    return ok(assets.map(({ name, size, sha256 }) => ({ name, size, sha256 })));
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
    name: "release-publish",
    parameters: ["<tag>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  const result = await publishRelease(args._.tag, resolve(import.meta.dir, ".."));
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${result.error}\n`);
    process.exitCode = 2;
    return;
  }
  for (const asset of result.value)
    process.stdout.write(`PUBLISHED: ${asset.name} ${asset.size} sha256:${asset.sha256}\n`);
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${String(error)}\n`);
    process.exitCode = 2;
  });
