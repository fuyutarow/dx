import { requireValue, undetermined } from "../errors.ts";
import { ok, safeTry } from "neverthrow";
import { z } from "zod";
import { context } from "../checks.ts";
import { fieldsSchema, type LoadedType } from "../model.ts";

import type { Snapshot } from "../collection.ts";
export async function view(types: readonly LoadedType[], head: Snapshot, name?: string) {
  return safeTry(async function* () {
    const views = types.flatMap((type) =>
      Object.entries(type.views).map(([key, fn]) => ({ name: key, type: type.name, fn })),
    );
    if (name === undefined)
      return ok(views.map(({ name: viewName, type }) => ({ v: 1, name: viewName, type })));
    const selected = yield* requireValue(
      views.find((v) => v.name === name),
      `unknown view: ${name}`,
    );
    const result = z.array(fieldsSchema).safeParse(await selected.fn(context(head, head)));
    if (!result.success) return undetermined(`invalid view output: ${result.error.message}`);
    return ok(result.data.map((row) => Object.assign({}, row, { v: 1 })));
  });
}
