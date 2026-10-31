import { test, expect } from "bun:test";
import { join } from "node:path";
import type { FinishRunner } from "../scripts/release-finish.ts";
import { publishRelease } from "../scripts/release-publish.ts";
import { releasePlatforms } from "../scripts/release-platforms.ts";
import { temporaryDirectory, write } from "./helpers.ts";
const done = (stdout = "", exit = 0, stderr = "") => ({ stdout, exit, stderr });

async function fixture(
  scenario: {
    createFails?: boolean;
    uploadFailures?: number;
    wrongSize?: boolean;
    digest?: string;
  } = {},
) {
  const root = await temporaryDirectory("semlint-release-publish-");
  const content = "archive bytes";
  const sha256 = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  for (const platform of releasePlatforms)
    await write(root, `dist/semlint-0.1.7-${platform}.tar.gz`, content);
  const calls: string[][] = [];
  let uploadFailures = scenario.uploadFailures ?? 0;
  const answer = (cmd: string[]) => {
    calls.push([...cmd]);
    if (cmd[0] === "bun") return done();
    if (cmd[2] === "create")
      return scenario.createFails === true ? done("", 1, "already exists") : done();
    if (cmd[2] === "upload") {
      if (uploadFailures > 0) {
        uploadFailures--;
        return done("", 1, "HTTP 502");
      }
      return done();
    }
    if (cmd[2] === "view")
      return done(
        JSON.stringify({
          assets: releasePlatforms.map((platform) => ({
            name: `semlint-0.1.7-${platform}.tar.gz`,
            state: "uploaded",
            size: scenario.wrongSize === true ? 1 : content.length,
            digest: scenario.digest ?? `sha256:${sha256}`,
          })),
        }),
      );
    if (cmd[2] === "edit") return done();
    return done("", 1, `unexpected ${JSON.stringify(cmd)}`);
  };
  const runner: FinishRunner = (cmd) => Promise.resolve(answer(cmd));
  return { root, calls, runner, sha256 };
}
const published = (calls: string[][]) => calls.some((cmd) => cmd[2] === "edit");

test("builds, drafts, uploads, verifies and only then publishes the tag as latest", async () => {
  const f = await fixture();
  const result = await publishRelease("v0.1.7", f.root, f.runner, "0.1.7");
  expect(result.isOk()).toBe(true);
  expect(f.calls.map((cmd) => cmd.slice(0, 3).join(" "))).toEqual([
    "bun scripts/release-build.ts",
    "gh release create",
    ...releasePlatforms.map(() => "gh release upload"),
    "gh release view",
    "gh release edit",
  ]);
  expect(f.calls[1]).toContain("--draft");
  expect(f.calls[1]).toContain("--verify-tag");
  expect(f.calls.at(-1)).toEqual(["gh", "release", "edit", "v0.1.7", "--draft=false", "--latest"]);
  expect(result._unsafeUnwrap()[0]?.sha256).toBe(f.sha256);
});

test("a tag that differs from package.json is refused before any build", async () => {
  const f = await fixture();
  const result = await publishRelease("v0.1.8", f.root, f.runner, "0.1.7");
  expect(result._unsafeUnwrapErr()).toContain("does not match");
  expect(f.calls).toHaveLength(0);
});

test("an existing release is not re-created and recovery keeps the draft", async () => {
  const f = await fixture({ createFails: true });
  const error = (await publishRelease("v0.1.7", f.root, f.runner, "0.1.7"))._unsafeUnwrapErr();
  expect(error).toContain("do not re-create");
  expect(f.calls.some((cmd) => cmd[2] === "upload")).toBe(false);
});

test("uploads retry with --clobber up to three attempts", async () => {
  const f = await fixture({ uploadFailures: 2 });
  expect((await publishRelease("v0.1.7", f.root, f.runner, "0.1.7")).isOk()).toBe(true);
  expect(f.calls.filter((cmd) => cmd.includes("--clobber"))).toHaveLength(2);
  const g = await fixture({ uploadFailures: 3 });
  expect((await publishRelease("v0.1.7", g.root, g.runner, "0.1.7"))._unsafeUnwrapErr()).toContain(
    "draft v0.1.7 retained",
  );
  expect(published(g.calls)).toBe(false);
});

test("size or digest mismatches keep the draft unpublished", async () => {
  for (const scenario of [{ wrongSize: true }, { digest: `sha256:${"0".repeat(64)}` }]) {
    const f = await fixture(scenario);
    const result = await publishRelease("v0.1.7", f.root, f.runner, "0.1.7");
    expect(result._unsafeUnwrapErr()).toContain("draft v0.1.7 retained");
    expect(published(f.calls)).toBe(false);
  }
});

test("missing archives after the build fail before creating a release", async () => {
  const f = await fixture();
  const result = await publishRelease("v0.1.7", join(f.root, "elsewhere"), f.runner, "0.1.7");
  expect(result.isErr()).toBe(true);
  expect(f.calls.some((cmd) => cmd[2] === "create")).toBe(false);
});
