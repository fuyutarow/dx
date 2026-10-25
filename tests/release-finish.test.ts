import { test, expect } from "bun:test";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { finishRelease, type FinishRunner } from "../scripts/release-finish.ts";
import { renderFormula } from "../scripts/brew-formula.ts";
import { releasePlatforms } from "../scripts/release-platforms.ts";
import { temporaryDirectory, write, processRun } from "./helpers.ts";
const done = (stdout = "", exit = 0, stderr = "") => ({ stdout, exit, stderr });

async function fixture(
  scenario: {
    missing?: boolean;
    digest?: boolean;
    dirty?: boolean;
    unpublished?: boolean;
    brewFailure?: boolean;
    shadow?: boolean;
    stale?: boolean;
    installed?: boolean;
  } = {},
) {
  const root = await temporaryDirectory("dx-brew-finish-");
  const repo = join(root, "repo");
  const workspace = join(root, "workspace");
  const prefix = join(root, "homebrew");
  await mkdir(repo);
  for (const name of ["one", "two"])
    await write(root, `workspace/${name}/dx.toml`, '[repo]\nname="fixture"\n');
  await write(root, "homebrew/bin/dx", "homebrew binary");
  await write(root, "old/dx", "old manager binary");
  const content = Buffer.from("published archive bytes");
  const digest = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  const assets = releasePlatforms.map((platform, index) => ({
    name: `dx-0.1.7-${platform}.tar.gz`,
    id: index + 1,
    size: content.length,
    digest: `sha256:${scenario.digest === true ? "0".repeat(64) : digest}`,
  }));
  const calls: string[][] = [];
  let remoteFormula = "";
  const runner: FinishRunner = async (cmd) => {
    calls.push([...cmd]);
    if (cmd[0] === "gh" && cmd[1] === "api" && cmd[2]?.endsWith("/releases/latest") === true)
      return done(
        JSON.stringify({
          tag_name: "v0.1.7",
          draft: false,
          prerelease: false,
          assets: scenario.missing === true ? assets.slice(1) : assets,
        }),
      );
    if (cmd[0] === "gh" && cmd[1] === "release") {
      const name = cmd[cmd.indexOf("--pattern") + 1];
      const dir = cmd[cmd.indexOf("--dir") + 1];
      if (name === undefined || dir === undefined) return done("", 2, "bad download args");
      await Bun.write(join(dir, name), content);
      return done();
    }
    if (cmd[0] === "git" && cmd[1] === "status")
      return done(scenario.dirty === true ? " M src/unrelated.ts\n" : "");
    if (cmd[0] === "git" && cmd[1] === "rev-parse") return done("a".repeat(40));
    if (cmd[0] === "git" && cmd[1] === "ls-remote")
      return done("a".repeat(40) + "\trefs/heads/alpha\n");
    if (cmd[0] === "mise") {
      remoteFormula = await Bun.file(join(repo, "Formula/dx.rb")).text();
      return done();
    }
    if (cmd[0] === "gh" && cmd[1] === "api")
      return done(
        Buffer.from(scenario.unpublished === true ? "wrong formula" : remoteFormula).toString(
          "base64",
        ),
      );
    if (cmd[0] === "brew" && cmd[1] === "update" && scenario.brewFailure === true)
      return done("", 1, "update failed");
    if (cmd[0] === "brew" && cmd[1] === "list")
      return scenario.installed === false ? done("", 1) : done("dx 0.1.6\n");
    if (cmd[0] === "brew" && cmd[1] === "--prefix") return done(prefix + "\n");
    if (cmd[0] === "brew") return done();
    if (cmd[0] === "sh")
      return done(join(root, scenario.shadow === true ? "old/dx" : "homebrew/bin/dx") + "\n");
    if (cmd[0] === "dx") return done(scenario.stale === true ? "dx 0.1.6\n" : "dx 0.1.7\n");
    return done("", 9, "unexpected command");
  };
  const progress: string[] = [];
  const invoke = (dryRun = false) =>
    finishRelease("0.1.7", { repo, workspace, dryRun }, runner, (line) => {
      progress.push(line);
    });
  return { root, repo, workspace, calls, invoke, runner, scenario };
}

test("hashes four published archives, publishes only the formula, upgrades and checks PATH", async () => {
  const f = await fixture();
  const result = await f.invoke();
  expect(result.isOk(), result.isErr() ? result.error : "").toBe(true);
  const formula = await Bun.file(join(f.repo, "Formula/dx.rb")).text();
  for (const platform of releasePlatforms) expect(formula).toContain(`dx-0.1.7-${platform}.tar.gz`);
  expect(formula).toContain('assert_equal "dx #{version}"');
  expect(formula).toContain("GitHub::API.credentials");
  expect(formula).not.toContain("ghp_");
  expect(f.calls.filter((cmd) => cmd[0] === "mise")).toEqual([
    [
      "mise",
      "run",
      "commit",
      "--",
      "-m",
      "release: update Homebrew dx formula",
      "--push",
      "--",
      "Formula/dx.rb",
    ],
  ]);
  expect(f.calls.filter((cmd) => cmd[0] === "dx")).toHaveLength(2);
  expect(f.calls.findIndex((cmd) => cmd[0] === "mise")).toBeLessThan(
    f.calls.findIndex((cmd) => cmd[0] === "brew"),
  );
  expect(f.calls).toContainEqual(["brew", "upgrade", "dx"]);
});

test("missing archives and checksum mismatches cannot publish a formula or touch brew", async () => {
  for (const scenario of [{ missing: true }, { digest: true }]) {
    const f = await fixture(scenario);
    const result = await f.invoke();
    expect(result.isErr()).toBe(true);
    expect(await Bun.file(join(f.repo, "Formula/dx.rb")).exists()).toBe(false);
    expect(f.calls.some((cmd) => cmd[0] === "brew" || cmd[0] === "mise")).toBe(false);
  }
});

test("formula publication, brew, version and equal-version PATH shadows fail closed", async () => {
  for (const scenario of [
    { unpublished: true },
    { brewFailure: true },
    { stale: true },
    { shadow: true },
  ]) {
    const f = await fixture(scenario);
    const result = await f.invoke();
    expect(result.isErr()).toBe(true);
    if (scenario.unpublished === true) expect(f.calls.some((cmd) => cmd[0] === "brew")).toBe(false);
  }
});

test("first installation and retry after machine failure do not create another formula commit", async () => {
  const f = await fixture({ brewFailure: true, installed: false });
  expect((await f.invoke()).isErr()).toBe(true);
  f.scenario.brewFailure = false;
  expect((await f.invoke()).isOk()).toBe(true);
  expect(f.calls.filter((cmd) => cmd[0] === "mise")).toHaveLength(1);
  expect(f.calls).toContainEqual(["brew", "install", "dx"]);
});

test("dirty release workspaces refuse publication and preview remains nonmutating", async () => {
  const f = await fixture({ dirty: true });
  expect((await f.invoke()).isErr()).toBe(true);
  expect(f.calls.some((cmd) => cmd[0] === "mise" || cmd[0] === "brew")).toBe(false);
  const preview = await f.invoke(true);
  expect(preview.isOk()).toBe(true);
  expect(await Bun.file(join(f.repo, "Formula/dx.rb")).exists()).toBe(false);
  expect(f.calls.some((cmd) => cmd[0] === "mise" || cmd[0] === "brew")).toBe(false);
});

test("formula rejects placeholder hashes, duplicated architectures and invalid versions", () => {
  const assets = releasePlatforms.map((platform, index) => ({
    platform,
    id: index + 1,
    sha256: "a".repeat(64),
  }));
  expect(renderFormula("latest", assets).isErr()).toBe(true);
  expect(
    renderFormula(
      "0.1.7",
      assets.map((asset) => ({ ...asset, sha256: "pending" })),
    ).isErr(),
  ).toBe(true);
  expect(renderFormula("0.1.7", [...assets.slice(0, 3), assets[0]!]).isErr()).toBe(true);
});

test("CLI help and invalid arguments perform no release actions", async () => {
  const root = await temporaryDirectory("dx-brew-cli-");
  const script = join(import.meta.dir, "../scripts/release-finish.ts");
  expect((await processRun(root, [process.execPath, script, "--help"])).exit).toBe(0);
  expect((await processRun(root, [process.execPath, script, "0.1.7", "extra"])).exit).toBe(2);
  expect((await processRun(root, [process.execPath, script, "--__proto__", "x"])).exit).toBe(2);
});
