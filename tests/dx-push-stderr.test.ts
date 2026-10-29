import { expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { dx, markdown, processRun, repo, snapshot, write } from "./helpers.ts";
import { pushRejectionDetails } from "../src/admit/process.ts";

const timeout = 60000;

test(
  "PUSH_REJECTED prints every remote hook line to stderr",
  async () => {
    const { cwd, base } = await repo();
    const remote = join(cwd, ".git", "bare.git");
    const init = await processRun(cwd, ["git", "init", "--bare", remote]);
    expect(init.exit, init.stderr).toBe(0);
    const add = await processRun(cwd, ["jj", "git", "remote", "add", "origin", remote]);
    expect(add.exit, add.stderr).toBe(0);
    const seed = await processRun(cwd, ["git", "push", remote, `${base}:refs/heads/alpha`]);
    expect(seed.exit, seed.stderr).toBe(0);
    const fetch = await processRun(cwd, ["jj", "git", "fetch", "--remote", "origin"]);
    expect(fetch.exit, fetch.stderr).toBe(0);

    await write(cwd, "records/rejected.md", markdown("rejected"));
    const head = await snapshot(cwd);
    const hook = join(remote, "hooks", "pre-receive");
    await Bun.write(
      hook,
      `#!${process.execPath}\nconsole.log("hook rejected records/a.md");\nconsole.log("second diagnostic: policy failed");\nconsole.log("third diagnostic: retry after fixing the record");\nprocess.exit(1);\n`,
    );
    await chmod(hook, 0o755);

    const result = await dx(cwd, "admit", head);
    expect(result.exit, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith("PUSH_REJECTED\nremote:");
    expect(
      result.stderr
        .split("\n")
        .filter((line) => line.startsWith("remote:"))
        .map((line) => line.trimEnd()),
    ).toEqual([
      "remote: hook rejected records/a.md",
      "remote: second diagnostic: policy failed",
      "remote: third diagnostic: retry after fixing the record",
    ]);
    expect(await processRun(remote, ["git", "rev-parse", "refs/heads/alpha"])).toMatchObject({
      stdout: `${base}\n`,
      exit: 0,
    });
  },
  timeout,
);

test("push rejection details retain fallback and stay within 200 lines", () => {
  expect(pushRejectionDetails("\nfatal: hook rejected\n")).toEqual(["fatal: hook rejected"]);
  const details = pushRejectionDetails(
    Array.from({ length: 203 }, (_, i) => `remote: line ${i + 1}`).join("\n"),
  );
  expect(details).toHaveLength(200);
  expect(details.at(-1)).toBe("… 4 lines omitted");
});
