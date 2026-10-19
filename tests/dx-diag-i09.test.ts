import { expect, test } from "bun:test";
import { advance, checked, markdown, repo, write } from "./helpers.ts";

test("I-09 finding names the changed policy file and states the rule", async () => {
  const { cwd } = await repo();
  const base = await advance(cwd);
  const policy = await Bun.file(`${cwd}/.dx/note.ts`).text();
  await write(cwd, ".dx/note.ts", `${policy}\n// changed policy\n`);
  await write(cwd, "records/a.md", markdown("a"));

  const result = await checked(cwd, base, 1);
  const finding = result.findings.find((row) => row.check === "I-09.policy");
  expect(finding?.message).toContain(".dx/note.ts");
  expect(finding?.message).toContain(
    "規則は dx.toml、.dx/ の下、[files] inputs。規則の変更は別の commit にする",
  );
}, 60000);
