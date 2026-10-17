import { z } from "zod";
import { undetermined } from "../errors.ts";
import type { LoadedType } from "../model.ts";
export function schema(types: readonly LoadedType[], name?: string) {
  if (name !== undefined) {
    const type = types.find((t) => t.name === name) ?? undetermined(`unknown type: ${name}`);
    return { ...z.toJSONSchema(type.schema, { io: "input" }), v: 1 };
  }
  return {
    v: 1,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: Object.fromEntries(
      types.map((type) => [type.name, z.toJSONSchema(type.schema, { io: "input" })]),
    ),
  };
}
