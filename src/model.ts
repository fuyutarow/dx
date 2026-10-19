import type { Result } from "neverthrow";
import { z } from "zod";
import { attempt } from "./errors.ts";

export const fieldsSchema = z.record(z.string(), z.unknown());
export type Fields = z.infer<typeof fieldsSchema>;
export interface SourceFile {
  readonly path: string;
  readonly name: string;
  readonly text: string;
  readonly body: string;
  readonly fields: Fields;
  readonly index: number;
}
export interface RecordModel {
  readonly v: 1;
  readonly id: string;
  readonly type: string;
  readonly path: string;
  readonly sha256: string;
  readonly by?: string;
  readonly links: readonly { readonly rel: string; readonly to: string }[];
  readonly fields: Fields;
}
export interface FindingInput {
  readonly check: string;
  readonly id?: string;
  readonly ids?: readonly string[];
  readonly path: string;
  readonly field?: string;
  readonly message: string;
}
export interface Finding extends FindingInput {
  readonly v: 1;
  readonly key: string;
  readonly new: boolean;
}
export interface TreeContext {
  readonly index: TreeIndex;
  readonly records: readonly RecordModel[];
  readonly base: readonly RecordModel[];
  readonly files: Readonly<Record<string, string>>;
  readonly read: (path: string) => string | undefined;
}
export interface TreeIndex {
  readonly byId: ReadonlyMap<string, readonly RecordModel[]>;
  readonly byType: ReadonlyMap<string, readonly RecordModel[]>;
}
export type TreeCheck = (
  tree: TreeContext,
) => readonly FindingInput[] | Promise<readonly FindingInput[]>;
export type Check = (
  record: RecordModel,
  tree: TreeContext,
) => readonly FindingInput[] | Promise<readonly FindingInput[]>;
export type View = (tree: TreeContext) => readonly Fields[] | Promise<readonly Fields[]>;
export interface Evidence {
  readonly locator: string;
  readonly status: string;
  readonly content?: string | undefined;
  readonly original_bytes?: number | undefined;
  readonly supplied_bytes?: number | undefined;
}
export type Verdict = z.infer<typeof verdictSchema>;
export interface FormatAdapter {
  readonly parse: (path: string, text: string) => SourceFile[] | Result<SourceFile[], string>;
  readonly hash: (file: SourceFile) => string;
  readonly reviewText: (file: SourceFile) => string | Result<string, string>;
  readonly writeReview?:
    | ((file: SourceFile, verdict: Verdict) => string | Result<string, string>)
    | undefined;
  readonly evidence?: ((file: SourceFile, tree: TreeContext) => readonly Evidence[]) | undefined;
}
export interface TypeDefinition {
  readonly name: string;
  readonly match: string | readonly string[];
  readonly format: "markdown-frontmatter" | "toml" | FormatAdapter;
  readonly id: (file: SourceFile) => string;
  readonly filename?: RegExp;
  readonly schema: z.ZodType;
  readonly links?: Readonly<Record<string, LinkDefinition>>;
  readonly immutable?: boolean;
  readonly checks?: readonly Check[];
  readonly treeChecks?: readonly TreeCheck[];
  readonly review?: { readonly rubric: string; readonly place: `file:${string}` };
  readonly views?: Readonly<Record<string, View>>;
}

export interface LinkDefinition {
  readonly to: string | readonly string[];
  readonly match?: string;
  readonly values?: (fieldValue: unknown) => readonly string[];
  readonly acyclic?: boolean;
}

// Callbacks are executable project policy. Their return values are checked separately.
const callback = <T extends (...args: never[]) => unknown>() =>
  z.custom<T>((value) => typeof value === "function", "expected a function");
const linkMatch = z.string().transform((source, ctx) => {
  const compiled = attempt(() => new RegExp(source, "u"));
  if (compiled.isErr()) {
    ctx.addIssue({ code: "custom", message: `invalid links.match: ${compiled.error}` });
    return z.NEVER;
  }
  // The empty alternative exposes every capture slot without needing a matching value.
  const captures = new RegExp(`(?:${source})|`, "u").exec("");
  if (captures === null || captures.length < 2) {
    ctx.addIssue({ code: "custom", message: "links.match requires capture group 1" });
    return z.NEVER;
  }
  return compiled.value;
});
export const typeSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*$/u),
  match: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  format: z.union([
    z.enum(["markdown-frontmatter", "toml"]),
    z.object({
      parse: callback<FormatAdapter["parse"]>(),
      hash: callback<FormatAdapter["hash"]>(),
      reviewText: callback<FormatAdapter["reviewText"]>(),
      writeReview: callback<NonNullable<FormatAdapter["writeReview"]>>().optional(),
      evidence: callback<NonNullable<FormatAdapter["evidence"]>>().optional(),
    }),
  ]),
  id: callback<TypeDefinition["id"]>(),
  filename: z.instanceof(RegExp).optional(),
  schema: z.instanceof(z.ZodType),
  links: z
    .record(
      z.string(),
      z.object({
        to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        match: linkMatch.optional(),
        values: callback<NonNullable<LinkDefinition["values"]>>().optional(),
        acyclic: z.boolean().default(true),
      }),
    )
    .default({}),
  immutable: z.boolean().default(false),
  checks: z.array(callback<Check>()).default([]),
  treeChecks: z.array(callback<TreeCheck>()).default([]),
  review: z
    .object({
      rubric: z.string().min(1),
      place: z.string().regex(/^file:.+$/u),
    })
    .optional(),
  views: z.record(z.string(), callback<View>()).default({}),
});
export type LoadedType = z.infer<typeof typeSchema>;
export const findingInputSchema = z
  .object({
    check: z.string().min(1),
    id: z.string().optional(),
    ids: z.array(z.string().min(1)).min(1).optional(),
    path: z.string(),
    field: z.string().optional(),
    message: z.string(),
  })
  .refine((finding) => finding.id === undefined || finding.ids === undefined, {
    message: "finding must use either id or ids, not both",
  });
export const verdictSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  rubric: z.string().min(1),
  rubric_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  by: z.string().min(1),
  at: z.iso.datetime({ offset: true }),
  bits: z.number().int().nonnegative(),
  p: z.array(z.number().min(0).max(1)).min(1),
  pass: z.boolean(),
});
