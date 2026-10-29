import { cli } from "cleye";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { version } from "../package.json" with { type: "json" };
import { releasePlatforms } from "./release-platforms.ts";

// Human/agent consumer: progress and one asset path/size receipt per platform.
function usage(message: string): never {
  process.stderr.write(`USAGE: ${message}\n`);
  return process.exit(2);
}

function rejectPrototypeFlag(arg: string): boolean {
  if (arg.split("=")[0] === "--__proto__") return usage("unknown option --__proto__");
  return false;
}

async function main(): Promise<void> {
  const parsed = cli({
    name: "release-build",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (parsed._.length > 0) usage("release-build takes no arguments");
  const root = join(import.meta.dir, "..");
  const dist = join(root, "dist");
  await mkdir(dist, { recursive: true });
  const staging = await mkdtemp(join(dist, ".release-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(staging, { recursive: true, force: true });
  });
  await build(root, dist, staging);
}

async function build(root: string, dist: string, staging: string): Promise<void> {
  for (const platform of releasePlatforms) {
    const directory = join(staging, platform);
    await mkdir(join(directory, "bin"), { recursive: true });
    const archive = join(dist, `semlint-${version}-${platform}.tar.gz`);
    // Remove an earlier artifact so a failed rebuild cannot leave a stale release asset.
    await rm(archive, { force: true });
    const compiled = Bun.spawn({
      timeout: 300000,
      cmd: [
        process.execPath,
        "build",
        "--compile",
        `--target=bun-${platform}`,
        "src/main.ts",
        "--outfile",
        join(directory, "bin/semlint"),
      ],
      cwd: root,
      env: {
        ...process.env,
        BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR ?? join(staging, "bun-cache"),
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    const exit = await compiled.exited;
    if (exit !== 0) {
      process.exitCode = exit;
      return;
    }
    const packed = Bun.spawn({
      cmd: ["tar", "-czf", archive, "-C", directory, "bin/semlint"],
      stdout: "inherit",
      stderr: "inherit",
      timeout: 60000,
    });
    const packedExit = await packed.exited;
    if (packedExit !== 0) {
      await rm(archive, { force: true });
      process.exitCode = packedExit;
      return;
    }
    process.stdout.write(`ASSET: ${archive} ${(await stat(archive)).size} bytes\n`);
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(`FATAL: ${String(error)}\n`);
  process.exitCode = 2;
});
