import { expect, test } from "bun:test";
import { parseRecords } from "../src/formats.ts";
import { advance, checked, markdown, repo, value, write } from "./helpers.ts";

// Every forbidden code point, including DEL as in the source-domain reference.
const forbidden = [
  ...Array.from({ length: 32 }, (_, index) => index).filter((code) => ![9, 10, 13].includes(code)),
  ...Array.from({ length: 33 }, (_, index) => index + 0x7f),
  0xfeff,
  0x2028,
  0x2029,
  0xfffe,
  0xffff,
  13,
];

for (const code of forbidden) {
  const character = String.fromCodePoint(code);
  const label = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  for (const [format, text] of [
    ["markdown-frontmatter", markdown("a", `# a${character}b\n`)],
    ["markdown-frontmatter", markdown("a", "", `body a${character}b\n`)],
    ["toml", `id = "a"\n# a${character}b\n`],
  ] as const) {
    test(`${format} rejects document character ${label}: ${JSON.stringify(text)}`, () => {
      const result = parseRecords("probe", text, format);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error).toContain(`document character ${label}`);
    });
  }
}

test("a leading BOM is rejected before splitting Markdown or decoding TOML", () => {
  for (const [format, text] of [
    ["markdown-frontmatter", `\uFEFF${markdown("a")}`],
    ["toml", '\uFEFFid = "a"\n'],
  ] as const) {
    const result = parseRecords("probe", text, format);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toContain("U+FEFF");
  }
});

test("tabs, LF, CRLF, Unicode and literal U+FFFD remain accepted", () => {
  for (const newline of ["\n", "\r\n"]) {
    const text = markdown("a", 'data: "日本語 café �"\n', "body\ttext\n").replaceAll("\n", newline);
    expect(value(parseRecords("a.md", text, "markdown-frontmatter"))[0]?.body).toBe(
      `body\ttext${newline}`,
    );
    expect(
      value(
        parseRecords("a.toml", `data = "日本語 café �"${newline}# tab\there${newline}`, "toml"),
      )[0]?.fields.data,
    ).toBe("日本語 café �");
  }
});

for (const format of ["markdown-frontmatter", "toml"] as const) {
  test(`${format} document rejection is format; I-02 retains unchanged records`, async () => {
    const { cwd, base } = await repo({ format });
    const path = `records/a.${format === "toml" ? "toml" : "md"}`;
    const text =
      format === "toml"
        ? 'id = "a"\ntitle = "Title"\n# bad\u000Cb\n'
        : markdown("a", "", "bad\u000Cb\n");
    await write(cwd, path, text);
    const initial = await checked(cwd, base, 1);
    expect(initial.findings).toHaveLength(1);
    expect(initial.findings[0]).toMatchObject({ check: "format", path, new: true });
    const next = await advance(cwd);
    const unchanged = await checked(cwd, next, 0);
    expect(unchanged.findings).toEqual([]);
    expect(unchanged.stderr).toContain("既存 1 件");
    await write(cwd, path, text + "# changed\n");
    const changed = await checked(cwd, next, 1);
    expect(changed.findings[0]).toMatchObject({ key: initial.findings[0]?.key, new: true });
  });
}
