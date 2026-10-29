import { expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { main, processRun, temporaryDirectory } from "./helpers.ts";

test("old jj stops before judgment with its version and location", async () => {
  const cwd = await temporaryDirectory("semlint-version-cwd-");
  const installed = "/home/fuyu/.local/share/mise/installs/jj/0.45.1";
  let bin = installed;
  if (!(await Bun.file(join(installed, "jj")).exists())) {
    bin = await temporaryDirectory("semlint-old-jj-");
    await Bun.write(join(bin, "jj"), "#!/bin/sh\necho 'jj 0.45.1'\n");
    await chmod(join(bin, "jj"), 0o755);
  }
  const result = await processRun(cwd, [
    "env",
    `PATH=${bin}:${process.env.PATH}`,
    process.execPath,
    main,
    "check",
    "@",
  ]);
  expect(result.exit).toBe(4);
  expect(result.stderr).toBe(
    `UNDETERMINED:jj 0.46.0 以上が要る（見つかったのは 0.45.1 at ${join(bin, "jj")}）。PATH の先頭に新しい jj を置く\n`,
  );
});

test("jj 0.46.0 passes the version check", async () => {
  const cwd = await temporaryDirectory("semlint-version-cwd-");
  const bin = "/home/linuxbrew/.linuxbrew/bin";
  const result = await processRun(cwd, [
    "env",
    `PATH=${bin}:${process.env.PATH}`,
    process.execPath,
    main,
    "check",
    "@",
  ]);
  expect(result.exit).toBe(4);
  expect(result.stderr).not.toContain("以上が要る");
});
