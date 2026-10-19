import { expect, test } from "bun:test";
import { dx, repo } from "./helpers.ts";

test('review.place = "frontmatter" is rejected with exit 4', async () => {
  const { cwd } = await repo({ review: "frontmatter" });
  const result = await dx(cwd, "check");

  expect(result.exit).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(
    'UNDETERMINED:policy: note: review.place = "frontmatter" は消えた。"file:<glob>" を使う',
  );
});
