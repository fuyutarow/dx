import type { TypeDefinition } from "./model.ts";
/** Declare pure revision policy; runtime validation happens when dx loads a tree. */
export function defineType<const T extends TypeDefinition>(definition: T): T {
  return definition;
}
export type {
  TypeDefinition,
  SourceFile,
  RecordModel,
  FindingInput,
  Finding,
  TreeContext,
  Check,
  View,
} from "./model.ts";
export { recordSha256, sha256 } from "./formats.ts";
