import { expect, test } from "bun:test";
import { z } from "../.preset/zod.ts";
import { runJex } from "../src/commands/review.ts";
import type { Evidence } from "../src/model.ts";
import { decode, temporaryDirectory } from "./helpers.ts";

test("jex receives raw record and in-tree evidence bytes, and external evidence content", async () => {
  const captureDir = await temporaryDirectory("dx-jex-raw-bytes-");
  const command = [
    process.execPath,
    `${import.meta.dir}/fixtures/fake-jex.ts`,
    "--capture-dir",
    captureDir,
  ];
  const recordBytes = '{\n  "id": "one",\n  "title": "Original formatting"\n}\n';
  const evidence: Evidence[] = [
    { locator: "linked/evidence.md", status: "supplied" },
    { locator: "outside/report.md", status: "supplied", content: "external content" },
  ];
  const result = await runJex(
    command,
    "records/one.toml",
    recordBytes,
    [{ id: "q1", question: "Question?" }],
    evidence,
    { "linked/evidence.md": "# Original linked evidence\n\nUnmodified.\n" },
  );
  expect(result.isOk()).toBe(true);
  const capture = decode(
    z.object({ files: z.record(z.string(), z.string()) }),
    await Bun.file(`${captureDir}/.jex-capture.json`).text(),
  );
  expect(capture.files["records/one.toml"]).toBe(recordBytes);
  expect(capture.files["linked/evidence.md"]).toBe("# Original linked evidence\n\nUnmodified.\n");
  expect(capture.files["outside/report.md"]).toBe("external content");
});
