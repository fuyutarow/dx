import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { checked, repo, snapshot, value, write } from "./helpers.ts";
import { RevisionReader } from "../src/repository.ts";

test("invalid UTF-8 in records and inputs becomes a format finding", async () => {
  const { cwd, base } = await repo({}, '[files]\ninputs = ["inputs/*.txt"]\n');
  const recordPath = "records/bad.md";
  const inputPath = "inputs/bad.txt";
  const recordBytes = Buffer.concat([
    Buffer.from("---\nid: bad\ntitle: 雪\n---\nbody "),
    Buffer.from([0xff]),
    Buffer.from("\n"),
  ]);
  const inputBytes = Buffer.from([0x61, 0x62, 0xff, 0x63]);
  await mkdir(join(cwd, "records"), { recursive: true });
  await mkdir(join(cwd, "inputs"), { recursive: true });
  await Bun.write(join(cwd, recordPath), recordBytes);
  await snapshot(cwd);
  await Bun.write(join(cwd, inputPath), inputBytes);
  await snapshot(cwd);

  const result = await checked(cwd, base, 1);
  expect(
    result.findings.some(
      (finding) =>
        finding.check === "format" &&
        finding.path === recordPath &&
        finding.field === recordPath &&
        finding.message === `invalid UTF-8 at byte ${recordBytes.indexOf(0xff)}`,
    ),
  ).toBe(true);
  expect(
    result.findings.some(
      (finding) =>
        finding.check === "format" &&
        finding.path === inputPath &&
        finding.field === inputPath &&
        finding.message === "invalid UTF-8 at byte 2",
    ),
  ).toBe(true);
});

test("valid multibyte UTF-8 is read unchanged", async () => {
  const { cwd } = await repo();
  const path = "records/unicode.md";
  const text = "\uFEFF---\nid: unicode\ntitle: 日本語 café\nby: author\n---\n雪だるま ☃\n";
  await write(cwd, path, text);
  const rev = await snapshot(cwd);
  const reader = new RevisionReader(cwd, 20000);
  const entry = value(await reader.tree(rev)).filter((item) => item.path === path);
  const contents = value(await reader.read(entry));
  expect(contents.get(path)).toBe(text);
  expect(contents.invalidUtf8.size).toBe(0);
});
