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
    formulaMissing?: boolean;
    formulaForbidden?: boolean;
    digest?: boolean;
    conflict?: boolean;
    unpublished?: boolean;
    brewFailure?: boolean;
    shadow?: boolean;
    stale?: boolean;
    installed?: boolean;
    oldTap?: boolean;
    workflowFailure?: boolean;
  } = {},
) {
  const root = await temporaryDirectory("semlint-brew-finish-");
  const repo = join(root, "repo");
  const workspace = join(root, "workspace");
  const prefix = join(root, "homebrew");
  await mkdir(repo);
  for (const name of ["one", "two"])
    await write(root, `workspace/${name}/semlint.toml`, '[repo]\nname="fixture"\n');
  await write(root, "homebrew/bin/semlint", "homebrew binary");
  await write(root, "old/semlint", "old manager binary");
  await write(
    root,
    "homebrew/opt/semlint/INSTALL_RECEIPT.json",
    JSON.stringify({
      source: { tap: scenario.oldTap === true ? "fuyutarow/semlint" : "fuyutarow/tap" },
    }),
  );
  const content = Buffer.from("published archive bytes");
  const digest = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  const assets = releasePlatforms.map((platform, index) => ({
    name: `semlint-0.1.7-${platform}.tar.gz`,
    id: index + 1,
    size: content.length,
    digest: `sha256:${scenario.digest === true ? "0".repeat(64) : digest}`,
  }));
  const calls: string[][] = [];
  let remoteFormula = "previous formula";
  let published = false;
  const runner: FinishRunner = async (cmd) => {
    calls.push([...cmd]);
    if (cmd[0] === "gh" && cmd[1] === "workflow")
      return scenario.workflowFailure === true
        ? done("", 1, "workflow dispatch failed")
        : done("https://github.com/fuyutarow/homebrew-tap/actions/runs/42\n");
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
    if (cmd[0] === "gh" && cmd[1] === "api" && cmd[2] === "--method") {
      if (scenario.conflict === true) return done("", 1, "HTTP 409: concurrent formula edit");
      const encodedFormula = cmd.find((arg) => arg.startsWith("content="));
      if (
        cmd[4] !== "repos/fuyutarow/homebrew-tap/contents/Formula/semlint.rb" ||
        !cmd.includes("branch=alpha") ||
        (scenario.formulaMissing === true && !published
          ? cmd.some((arg) => arg.startsWith("sha="))
          : !cmd.includes(`sha=${"a".repeat(40)}`)) ||
        encodedFormula === undefined
      )
        return done("", 1, "wrong publication scope or missing SHA precondition");
      remoteFormula = Buffer.from(encodedFormula.slice("content=".length), "base64").toString(
        "utf8",
      );
      published = true;
      return done("b".repeat(40));
    }
    if (cmd[0] === "gh" && cmd[1] === "api" && scenario.formulaForbidden === true)
      return done("", 1, "gh: Forbidden (HTTP 403)");
    if (cmd[0] === "gh" && cmd[1] === "api" && scenario.formulaMissing === true && !published)
      return done("", 1, "gh: Not Found (HTTP 404)");
    if (cmd[0] === "gh" && cmd[1] === "api")
      return done(
        JSON.stringify({
          sha: "a".repeat(40),
          content: Buffer.from(
            scenario.unpublished === true && published ? "wrong formula" : remoteFormula,
          ).toString("base64"),
        }),
      );
    if (cmd[0] === "brew" && cmd[1] === "update" && scenario.brewFailure === true)
      return done("", 1, "update failed");
    // A second tap may also define semlint: every formula action must name our tap.
    if (
      cmd[0] === "brew" &&
      ["list", "upgrade", "install", "test"].includes(cmd[1] ?? "") &&
      cmd.at(-1) !== "fuyutarow/tap/semlint"
    )
      return done("", 1, "ambiguous formula semlint");
    if (cmd[0] === "brew" && cmd[1] === "list")
      return scenario.installed === false ? done("", 1) : done("semlint 0.1.6\n");
    if (cmd[0] === "brew" && cmd[1] === "--prefix")
      return done((cmd.length === 3 ? join(prefix, "opt/semlint") : prefix) + "\n");
    if (cmd[0] === "brew") return done();
    if (cmd[0] === "sh")
      return done(
        join(root, scenario.shadow === true ? "old/semlint" : "homebrew/bin/semlint") + "\n",
      );
    if (cmd[0] === "semlint")
      return done(scenario.stale === true ? "semlint 0.1.6\n" : "semlint 0.1.7\n");
    return done("", 9, "unexpected command");
  };
  const progress: string[] = [];
  const invoke = (dryRun = false) =>
    finishRelease("0.1.7", { repo, workspace, dryRun }, runner, (line) => {
      progress.push(line);
    });
  return { root, repo, workspace, calls, invoke, runner, scenario, formula: () => remoteFormula };
}

test("hashes four published archives, commits only the common-tap formula, upgrades and checks PATH", async () => {
  const f = await fixture();
  const result = await f.invoke();
  expect(result.isOk(), result.isErr() ? result.error : "").toBe(true);
  const formula = f.formula();
  expect(formula).toContain("class Semlint < Formula");
  expect(formula).toContain('homepage "https://github.com/fuyutarow/semlint"');
  expect(formula).toContain('shell_output("#{bin}/semlint --version")');
  for (const platform of releasePlatforms)
    expect(formula).toContain(`semlint-0.1.7-${platform}.tar.gz`);
  expect(formula).toContain('assert_equal "semlint #{version}"');
  expect(formula).not.toContain("GitHub::API.credentials");
  expect(formula).not.toContain("Authorization:");
  expect(formula).not.toContain("DownloadStrategy");
  for (const platform of releasePlatforms)
    expect(formula).toContain(
      `https://github.com/fuyutarow/semlint/releases/download/v0.1.7/semlint-0.1.7-${platform}.tar.gz`,
    );
  expect(formula).not.toContain("ghp_");
  expect(f.calls.filter((cmd) => cmd.includes("PUT"))).toHaveLength(1);
  expect(f.calls.some((cmd) => cmd[0] === "git" || cmd[0] === "mise")).toBe(false);
  expect(await Bun.file(join(f.repo, "Formula/semlint.rb")).exists()).toBe(false);
  expect(f.calls.filter((cmd) => cmd[0] === "semlint")).toHaveLength(2);
  expect(f.calls.findIndex((cmd) => cmd.includes("PUT"))).toBeLessThan(
    f.calls.findIndex((cmd) => cmd[0] === "brew"),
  );
  expect(f.calls).toContainEqual(["brew", "upgrade", "fuyutarow/tap/semlint"]);
  expect(f.calls).toContainEqual(["gh", "api", "repos/fuyutarow/semlint/releases/latest"]);
  expect(f.calls.filter((cmd) => cmd[0] === "sh")).toEqual([
    ["sh", "-c", "command -v semlint"],
    ["sh", "-c", "command -v semlint"],
  ]);
  expect(f.calls).toContainEqual(["semlint", "--version"]);
  expect(f.calls.at(-1)).toEqual([
    "gh",
    "workflow",
    "run",
    "update-formulas.yml",
    "-R",
    "fuyutarow/homebrew-tap",
    "-f",
    "tool=semlint",
  ]);
});

test("creates a missing formula without SHA and continues", async () => {
  const f = await fixture({ formulaMissing: true });
  const result = await f.invoke();
  expect(result.isOk(), result.isErr() ? result.error : "").toBe(true);
  const put = f.calls.find((cmd) => cmd.includes("PUT"));
  expect(put).toBeDefined();
  expect(put?.some((arg) => arg.startsWith("sha="))).toBe(false);
  expect(f.calls).toContainEqual(["brew", "update"]);
});

test("formula GET forbidden fails before publication", async () => {
  const f = await fixture({ formulaForbidden: true });
  const result = await f.invoke();
  expect(result.isErr() && result.error).toContain("HTTP 403");
  expect(f.calls.some((cmd) => cmd.includes("PUT") || cmd[0] === "brew")).toBe(false);
});

test("missing formula creation conflicts fail closed", async () => {
  const f = await fixture({ formulaMissing: true, conflict: true });
  expect((await f.invoke()).isErr()).toBe(true);
  expect(f.calls.some((cmd) => cmd[0] === "brew")).toBe(false);
});

test("missing archives and checksum mismatches cannot publish a formula or touch brew", async () => {
  for (const scenario of [{ missing: true }, { digest: true }]) {
    const f = await fixture(scenario);
    const result = await f.invoke();
    expect(result.isErr()).toBe(true);
    expect(await Bun.file(join(f.repo, "Formula/semlint.rb")).exists()).toBe(false);
    expect(f.calls.some((cmd) => cmd[0] === "brew" || cmd.includes("PUT"))).toBe(false);
  }
});

test("formula publication, brew, version and equal-version PATH shadows fail closed", async () => {
  for (const scenario of [
    { unpublished: true },
    { brewFailure: true },
    { stale: true },
    { shadow: true },
    { oldTap: true },
    { conflict: true },
    { workflowFailure: true },
  ]) {
    const f = await fixture(scenario);
    const result = await f.invoke();
    expect(result.isErr()).toBe(true);
    if (scenario.unpublished === true || scenario.conflict === true)
      expect(f.calls.some((cmd) => cmd[0] === "brew")).toBe(false);
    if (scenario.workflowFailure === true) {
      expect(f.calls.filter((cmd) => cmd[0] === "semlint")).toHaveLength(2);
      expect(result.isErr() && result.error).toContain("workflow dispatch failed");
    } else expect(f.calls.some((cmd) => cmd[1] === "workflow")).toBe(false);
  }
});

test("first installation and retry after machine failure do not create another formula commit", async () => {
  const f = await fixture({ brewFailure: true, installed: false });
  expect((await f.invoke()).isErr()).toBe(true);
  f.scenario.brewFailure = false;
  expect((await f.invoke()).isOk()).toBe(true);
  expect(f.calls.filter((cmd) => cmd.includes("PUT"))).toHaveLength(1);
  expect(f.calls).toContainEqual(["brew", "install", "fuyutarow/tap/semlint"]);
});

test("preview does not publish or change the semlint checkout, and local edits stay local", async () => {
  const f = await fixture();
  await write(f.repo, "src/local.ts", "unreleased local work");
  const preview = await f.invoke(true);
  expect(preview.isOk()).toBe(true);
  expect(await Bun.file(join(f.repo, "Formula/semlint.rb")).exists()).toBe(false);
  expect(
    f.calls.some((cmd) => cmd.includes("PUT") || cmd[0] === "brew" || cmd[1] === "workflow"),
  ).toBe(false);
  expect((await f.invoke()).isOk()).toBe(true);
  expect(await Bun.file(join(f.repo, "src/local.ts")).text()).toBe("unreleased local work");
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
  const root = await temporaryDirectory("semlint-brew-cli-");
  const script = join(import.meta.dir, "../scripts/release-finish.ts");
  expect((await processRun(root, [process.execPath, script, "--help"])).exit).toBe(0);
  expect((await processRun(root, [process.execPath, script, "0.1.7", "extra"])).exit).toBe(2);
  expect((await processRun(root, [process.execPath, script, "--__proto__", "x"])).exit).toBe(2);
});
