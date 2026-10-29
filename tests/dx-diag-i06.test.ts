import { expect, test } from "bun:test";
import { checked, markdown, repo, write } from "./helpers.ts";

test("I-06 missing verdict finding explains how to admit the working-copy verdict", async () => {
  const { cwd, base } = await repo({ review: "file:verdicts/*.jsonl" });
  await write(cwd, "records/one.md", markdown("one"));

  const result = await checked(cwd, base, 1);
  const finding = result.findings.find((row) => row.check === "I-06.verdict");

  expect(finding?.message).toContain(
    'semlint review は verdict を作業コピーに書く。jj commit -m "<説明>" で verdict を確定してから、その commit を admit する（例: semlint admit @-）',
  );
}, 60000);
