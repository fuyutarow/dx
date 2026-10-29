import { expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import {
  dx,
  main,
  markdown,
  processRun,
  repo,
  rows,
  temporaryDirectory,
  write,
} from "./helpers.ts";

test("check reads a record written since the last jj snapshot", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/fresh.md", markdown("fresh", "bad: true\n"));
  const result = await dx(cwd, "check", "@", "--base", base);
  expect(result.exit, result.stderr).toBe(1);
  expect(rows(result.stdout)).toContainEqual(
    expect.objectContaining({ id: "fresh", check: "quality" }),
  );
});

test("snapshot failure stops the judgment with a recovery instruction", async () => {
  const { cwd } = await repo();
  const bin = await temporaryDirectory("semlint-bin-");
  const executable = join(bin, "jj");
  await Bun.write(
    executable,
    "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'jj 0.46.0\\n'; exit 0; fi\nprintf 'snapshot failed\\nextra detail\\n' >&2\nexit 1\n",
  );
  await chmod(executable, 0o755);
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
    "UNDETERMINED:作業コピーを取り込めない: snapshot failed。jj st で原因を見るか、commit してから semlint check @- にかける\n",
  );
});
