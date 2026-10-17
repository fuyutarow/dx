import { expect, test } from "bun:test";
import { classify, findingKey } from "../src/findings.ts";
import { findingInputSchema, type FindingInput } from "../src/model.ts";

const groupFinding = (ids: string[]): FindingInput => ({
  check: "soks.group-rule",
  ids,
  path: "knowledge/index.md",
  field: "group-rule",
  message: "group rule is violated",
});

test("I-02: a group finding is new when any member record changed", () => {
  const base = [groupFinding(["sok", "pro", "led"])];

  expect(classify([groupFinding(["led", "sok", "pro"])], base, new Set(), new Set())).toMatchObject(
    [{ ids: ["led", "pro", "sok"], new: false }],
  );
  expect(
    classify([groupFinding(["led", "sok", "pro"])], base, new Set(["pro"]), new Set()),
  ).toMatchObject([{ ids: ["led", "pro", "sok"], new: true }]);
});

test("finding keys for ids ignore input order and preserve the single-id key", () => {
  expect(findingKey(groupFinding(["sok", "pro", "led"]))).toBe(
    findingKey(groupFinding(["led", "sok", "pro"])),
  );
  expect(
    findingKey({ check: "quality", id: "note-1", path: "note.md", field: "title", message: "bad" }),
  ).toBe(JSON.stringify(["quality", "note-1", "title"]));
});

test("finding input accepts one subject form and rejects both or an empty ids list", () => {
  expect(
    findingInputSchema.safeParse({ check: "group", ids: ["a", "b"], path: "x", message: "bad" })
      .success,
  ).toBe(true);
  expect(
    findingInputSchema.safeParse({
      check: "group",
      id: "a",
      ids: ["a", "b"],
      path: "x",
      message: "bad",
    }).success,
  ).toBe(false);
  expect(
    findingInputSchema.safeParse({ check: "group", ids: [], path: "x", message: "bad" }).success,
  ).toBe(false);
});

test("I-02: changed paths promote existing keys independently of record IDs", () => {
  const finding = groupFinding(["a", "b"]);
  expect(classify([finding], [finding], new Set(), new Set([finding.path]))).toMatchObject([
    { new: true },
  ]);
  expect(classify([finding], [finding], new Set(), new Set(["other.md"]))).toMatchObject([
    { new: false },
  ]);
});
