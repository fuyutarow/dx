import { z } from "zod";
import { context } from "../checks.ts";
import { fieldsSchema, type LoadedType } from "../model.ts";
import { undetermined } from "../errors.ts";
import type { Snapshot } from "../collection.ts";
export async function view(types: readonly LoadedType[], head: Snapshot, name?: string) {
  const views = types.flatMap((type) =>
    Object.entries(type.views).map(([key, fn]) => ({ name: key, type: type.name, fn })),
  );
  if (name === undefined) return views.map(({ name, type }) => ({ v: 1, name, type }));
  const selected = views.find((v) => v.name === name) ?? undetermined(`unknown view: ${name}`);
  const result = z.array(fieldsSchema).safeParse(await selected.fn(context(head, head)));
  if (!result.success) return undetermined(`invalid view output: ${result.error.message}`);
  return result.data.map((row) => ({ ...row, v: 1 }));
}
