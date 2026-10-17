import { z } from "zod";

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
  readonly records: readonly RecordModel[];
  readonly base: readonly RecordModel[];
  readonly files: Readonly<Record<string, string>>;
  readonly read: (path: string) => string | undefined;
}
export type Check = (
  record: RecordModel,
  tree: TreeContext,
) => readonly FindingInput[] | Promise<readonly FindingInput[]>;
export type View = (tree: TreeContext) => readonly Fields[] | Promise<readonly Fields[]>;
export interface TypeDefinition {
  readonly name: string;
  readonly match: string | readonly string[];
  readonly format: "markdown-frontmatter" | "toml";
  readonly id: (file: SourceFile) => string;
  readonly filename?: RegExp;
  readonly schema: z.ZodType;
  readonly links?: Readonly<Record<string, { readonly to: string }>>;
  readonly immutable?: boolean;
  readonly checks?: readonly Check[];
  readonly review?: { readonly rubric: string; readonly place: string };
  readonly views?: Readonly<Record<string, View>>;
}

// Callbacks are executable project policy. Their return values are checked separately.
const callback = <T extends (...args: never[]) => unknown>() =>
  z.custom<T>((value) => typeof value === "function", "expected a function");
export const typeSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*$/u),
  match: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  format: z.enum(["markdown-frontmatter", "toml"]),
  id: callback<TypeDefinition["id"]>(),
  filename: z.instanceof(RegExp).optional(),
  schema: z.instanceof(z.ZodType),
  links: z.record(z.string(), z.object({ to: z.string().min(1) })).default({}),
  immutable: z.boolean().default(false),
  checks: z.array(callback<Check>()).default([]),
  review: z
    .object({
      rubric: z.string().min(1),
      place: z.string().regex(/^(?:frontmatter|file:.+)$/u),
    })
    .optional(),
  views: z.record(z.string(), callback<View>()).default({}),
});
export type LoadedType = z.infer<typeof typeSchema>;
export const findingInputSchema = z.object({
  check: z.string().min(1),
  id: z.string().optional(),
  path: z.string(),
  field: z.string().optional(),
  message: z.string(),
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
