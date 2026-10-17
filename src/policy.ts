import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { typeSchema, type LoadedType } from "./model.ts";
import { undetermined } from "./errors.ts";

export function matches(patterns: string | readonly string[], path: string): boolean {
  const values = typeof patterns === "string" ? [patterns] : patterns;
  return values.some((pattern) => new Bun.Glob(pattern).match(path));
}
export async function loadTypes(files: Readonly<Record<string, string>>): Promise<LoadedType[]> {
  const entries = Object.keys(files)
    .filter((p) => /^\.dx\/[^/]+\.ts$/u.test(p))
    .toSorted();
  if (entries.length === 0) return undetermined(".dx/: no type definitions");
  // Bundle revision sources in memory, then dynamically import them. Runtime onResolve
  // does not reliably intercept bare package imports in Bun 1.4.2; build hooks do.
  const entry =
    entries
      .map((path, index) => `import type${index} from ${JSON.stringify(`./${path}`)};`)
      .join("\n") + `\nexport default [${entries.map((_, index) => `type${index}`).join(",")}];`;
  const result = await Bun.build({
    entrypoints: ["/dx-revision/entry.ts"],
    root: "/",
    target: "bun",
    plugins: [
      {
        name: "dx-revision",
        setup(build) {
          build.onResolve({ filter: /.*/u }, (args) => {
            if (args.path === "dx")
              return {
                path: fileURLToPath(import.meta.resolve("./index.ts")),
                external: true,
              };
            if (args.path === "zod" || args.path === "neverthrow")
              return {
                path: fileURLToPath(import.meta.resolve(args.path)),
                external: true,
              };
            if (args.path === "/dx-revision/entry.ts")
              return { path: args.path, namespace: "dx-revision" };
            if (!args.path.startsWith("."))
              return undetermined(
                `policy import must be relative, dx, zod or neverthrow: ${args.path}`,
              );
            let path = posix.normalize(posix.join(posix.dirname(args.importer), args.path));
            if (!path.startsWith("/dx-revision/.dx/"))
              return undetermined(`policy import escapes .dx/: ${path}`);
            if (files[path.slice(13)] === undefined && files[`${path.slice(13)}.ts`] !== undefined)
              path += ".ts";
            if (files[path.slice(13)] === undefined)
              return undetermined(`missing revision module: ${path}`);
            return { path, namespace: "dx-revision" };
          });
          build.onLoad({ filter: /.*/u, namespace: "dx-revision" }, (args) => ({
            contents:
              args.path === "/dx-revision/entry.ts"
                ? entry
                : (files[args.path.slice(13)] ??
                  undetermined(`missing revision module: ${args.path}`)),
            loader: "ts",
          }));
        },
      },
    ],
  });
  if (!result.success) return undetermined(`.dx/: ${result.logs.map(String).join("; ")}`);
  const output = result.outputs[0] ?? undetermined(".dx/: empty module build");
  const module: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(await output.text()).toString("base64")}`
  );
  const parsed = z.object({ default: z.array(typeSchema) }).safeParse(module);
  if (!parsed.success) return undetermined(`.dx/: ${parsed.error.message}`);
  const types = parsed.data.default;
  const views = new Set<string>();
  const names = new Set(types.map((t) => t.name));
  for (let index = 0; index < types.length; index += 1) {
    const type = types[index];
    if (type === undefined) continue;
    if (entries[index] !== `.dx/${type.name}.ts`)
      return undetermined(`type name must match file: ${entries[index]}`);
    if (type.immutable && type.review?.place === "frontmatter")
      return undetermined(`${type.name}: immutable types require file:<glob> review storage`);
    for (const link of Object.values(type.links)) {
      if (!names.has(link.to)) return undetermined(`undeclared target type: ${link.to}`);
    }
    for (const name of Object.keys(type.views)) {
      if (views.has(name)) return undetermined(`ambiguous view: ${name}`);
      views.add(name);
    }
  }
  return types;
}
