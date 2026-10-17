import { requireValue, attempt, validate, undetermined } from "./errors.ts";
import { ok, safeTry } from "neverthrow";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { z } from "zod";
import { isAlias, isNode, isPair, isScalar, parseDocument, visit } from "yaml";

import {
  fieldsSchema,
  type SourceFile,
  type FormatAdapter,
  type Verdict,
  type TypeDefinition,
} from "./model.ts";

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
export function splitMarkdown(
  text: string,
): { header: string; body: string; opening: string; closing: string } | undefined {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)^---(?:\r?\n|$)/mu.exec(text);
  const opening = (match?.[0].indexOf("\n") ?? -1) + 1;
  return match?.index === 0 && match[1] !== undefined
    ? {
        header: match[1],
        body: text.slice(match[0].length),
        opening: text.slice(0, opening),
        closing: match[0].slice(opening + match[1].length),
      }
    : undefined;
}
function object(value: unknown) {
  return validate(fieldsSchema, value);
}
/** Inspect syntax before Bun can overwrite keys or resolve references. */
function parseFrontmatter(header: string) {
  return safeTry(function* () {
    const document = yield* attempt(() =>
      parseDocument(header, {
        strict: true,
        uniqueKeys: true,
        merge: false,
        keepSourceTokens: true,
      }),
    );
    const error = document.errors[0];
    if (error !== undefined) return undetermined(error.message);
    let failure: string | undefined;
    visit(document, (key, node) => {
      if (isAlias(node)) failure = "YAML aliases are unsupported";
      if (isNode(node)) {
        if (node.anchor !== undefined) failure = "YAML anchors are unsupported";
        if (node.tag !== undefined) failure = "YAML tags are unsupported";
      }
      if (isPair(node)) {
        if (!isScalar(node.key) || typeof node.key.value !== "string")
          failure = "YAML keys must be strings; complex keys are unsupported";
        else if (node.key.value === "<<") failure = "YAML merge keys are unsupported";
        // Scalar nodes alone lose the distinction between implicit and explicit keys.
        // Pair source tokens preserve it in block maps, flow maps and flow sequences.
        else if (node.srcToken?.start.some((token) => token.type === "explicit-key-ind") === true)
          failure = "YAML explicit keys are unsupported";
      }
      if (
        key !== "key" &&
        isScalar(node) &&
        typeof node.value === "string" &&
        /[\u0085\uFEFF]/u.test(node.value)
      )
        failure = "YAML string values must not contain U+0085 or U+FEFF";
      return failure === undefined ? undefined : visit.BREAK;
    });
    if (failure !== undefined) return undetermined(failure);
    // Preserve the existing scalar decoding and semantic hashes for ordinary YAML.
    return attempt((): unknown => Bun.YAML.parse(header));
  });
}
export function parseRecords(path: string, text: string, format: TypeDefinition["format"]) {
  return safeTry(function* () {
    if (typeof format !== "string") {
      const parse = format.parse;
      const value = yield* attempt(() => parse.call(format, path, text));
      return Array.isArray(value) ? ok(value) : value;
    }
    // The built-in formats share a source domain across the entire document,
    // including comments, Markdown bodies and a possible leading BOM.
    const forbidden =
      // oxlint-disable-next-line no-control-regex -- Detect the forbidden source characters themselves.
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF\u2028\u2029\uFFFE\uFFFF]|\r(?!\n)/u.exec(
        text,
      );
    if (forbidden !== null) {
      const code = forbidden[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
      return undetermined(`document character U+${code} is outside the accepted input domain`);
    }
    if (format === "markdown-frontmatter") {
      const parts = splitMarkdown(text);
      if (parts === undefined) return validate(z.array(z.never()), undefined);
      return ok([
        {
          path,
          name: basename(path),
          text,
          body: parts.body,
          fields: yield* object(yield* parseFrontmatter(parts.header)),
          index: 0,
        },
      ]);
    }
    const parsed = yield* object(yield* attempt((): unknown => Bun.TOML.parse(text)));
    const rows =
      parsed.records === undefined
        ? [parsed]
        : yield* validate(z.array(fieldsSchema), parsed.records);
    return ok(
      rows.map((fields, index) => ({
        path,
        name: basename(path),
        text,
        body: "",
        fields,
        index,
      })),
    );
  });
}
/** Review metadata is excluded from semantic hashes, avoiding a self-referential verdict. */
export function recordSha256(file: SourceFile): string {
  const { review: _review, ...fields } = file.fields;
  return sha256(stableJson({ fields, body: file.body }));
}
function normalize(item: unknown): unknown {
  if (Array.isArray(item)) return item.map((entry) => normalize(entry));
  const parsed = fieldsSchema.safeParse(item);
  if (!parsed.success) return item;
  return Object.fromEntries(
    Object.keys(parsed.data)
      .toSorted()
      .map((key) => [key, normalize(parsed.data[key])]),
  );
}
export function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/** Strip only metadata; record text and the rest of the header remain intact. */
export function withoutReview(text: string) {
  const parts = splitMarkdown(text);
  if (parts === undefined) return undetermined("missing frontmatter");
  const kept: string[] = [];
  let removing = false;
  for (const line of parts.header.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    if (/^(?:review|"review"|'review')\s*:/u.test(line)) {
      removing = true;
      continue;
    }
    if (removing && /^[ \t]+\S/u.test(line)) continue;
    if (!/^\s*$/u.test(line)) removing = false;
    kept.push(line);
  }
  return ok(parts.opening + kept.join("") + parts.closing + parts.body);
}
function writeMarkdownReview(file: SourceFile, verdict: Verdict) {
  return safeTry(function* () {
    const clean = yield* withoutReview(file.text);
    const parts = yield* requireValue(splitMarkdown(clean), "missing frontmatter");
    const newline = clean.includes("\r\n") ? "\r\n" : "\n";
    const output =
      parts.opening +
      parts.header +
      `review: ${JSON.stringify(verdict)}${newline}` +
      parts.closing +
      parts.body;
    const roundTrip = yield* requireValue(
      (yield* parseRecords(file.path, output, "markdown-frontmatter"))[0],
      "review round trip failed",
    );
    if (
      recordSha256(roundTrip) !== recordSha256(file) ||
      stableJson(roundTrip.fields.review) !== stableJson(verdict)
    )
      return undetermined("review insertion changed record hash or verdict");
    return ok(output);
  });
}
export const markdownFrontmatter: FormatAdapter = {
  parse: (path, text) => parseRecords(path, text, "markdown-frontmatter"),
  hash: recordSha256,
  reviewText: (file) => withoutReview(file.text),
  writeReview: writeMarkdownReview,
};
export const tomlFormat: FormatAdapter = {
  parse: (path, text) => parseRecords(path, text, "toml"),
  hash: recordSha256,
  reviewText: (file) =>
    stableJson(Object.fromEntries(Object.entries(file.fields).filter(([key]) => key !== "review"))),
};
export function formatAdapter(format: TypeDefinition["format"]): FormatAdapter {
  if (typeof format !== "string") return format;
  return format === "toml" ? tomlFormat : markdownFrontmatter;
}
