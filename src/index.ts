import type { TypeDefinition } from "./model.ts";
/** Declare pure revision policy; runtime validation happens when semlint loads a tree. */
export function defineType<const T extends TypeDefinition>(definition: T): T {
  return definition;
}
export type {
  TypeDefinition,
  LinkDefinition,
  FormatAdapter,
  Evidence,
  Verdict,
  SourceFile,
  RecordModel,
  FindingInput,
  Finding,
  TreeContext,
  TreeIndex,
  TreeCheck,
  Check,
  View,
} from "./model.ts";
export { recordSha256, sha256, markdownFrontmatter, tomlFormat } from "./formats.ts";
