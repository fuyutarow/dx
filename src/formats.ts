import { createHash } from "node:crypto";
import { basename } from "node:path";
import { z } from "zod";
import { fieldsSchema, type Fields, type SourceFile } from "./model.ts";

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
export function splitMarkdown(text: string) {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)^---(?:\r?\n|$)/mu.exec(text);
  if (match?.index !== 0 || match[1] === undefined) return undefined;
  return { header: match[1], body: text.slice(match[0].length) };
}
function object(value: unknown): Fields {
  return fieldsSchema.parse(value);
}
export function parseRecords(path: string, text: string, format: string): SourceFile[] {
  if (format === "markdown-frontmatter") {
    const parts = splitMarkdown(text);
    if (parts === undefined) return z.array(z.never()).parse(undefined);
    return [
      {
        path,
        name: basename(path),
        text,
        body: parts.body,
        fields: object(Bun.YAML.parse(parts.header)),
        index: 0,
      },
    ];
  }
  const parsed = object(Bun.TOML.parse(text));
  const rows =
    parsed.records === undefined ? [parsed] : z.array(fieldsSchema).parse(parsed.records);
  return rows.map((fields, index) => ({
    path,
    name: basename(path),
    text,
    body: "",
    fields,
    index,
  }));
}
/** Review metadata is excluded from semantic hashes, avoiding a self-referential verdict. */
export function recordSha256(file: SourceFile): string {
  const { review: _review, ...fields } = file.fields;
  return sha256(stableJson({ fields, body: file.body }));
}
export function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    const parsed = fieldsSchema.safeParse(item);
    if (!parsed.success) return item;
    return Object.fromEntries(
      Object.keys(parsed.data)
        .toSorted()
        .map((key) => [key, normalize(parsed.data[key])]),
    );
  };
  return JSON.stringify(normalize(value));
}
