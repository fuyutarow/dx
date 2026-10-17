import { requireValue } from "../errors.ts";
import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import type { LoadedType } from "../model.ts";
export function schema(types: readonly LoadedType[], name?: string) {
  return safeTry(function* () {
    if (name !== undefined) {
      const type = yield* requireValue(
        types.find((t) => t.name === name),
        `unknown type: ${name}`,
      );
      return ok({ ...z.toJSONSchema(type.schema, { io: "input" }), v: 1 });
    }
    return ok({
      v: 1,
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: Object.fromEntries(
        types.map((type) => [type.name, z.toJSONSchema(type.schema, { io: "input" })]),
      ),
    });
  });
}
