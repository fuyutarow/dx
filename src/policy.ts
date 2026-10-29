import { ok, safeTry, ResultAsync } from "neverthrow";
import { requireValue, undetermined } from "./errors.ts";
import { posix } from "node:path";
import { plugin } from "bun";
import * as semlint from "./index.ts";
import * as zod from "zod";
import * as neverthrow from "neverthrow";
import { z } from "zod";
import { rejectRemovedLinkMatch, typeSchema } from "./model.ts";
import type { Config } from "./config.ts";
import { isLayoutPath, policyDir } from "./layout.ts";

// Policies share the host's API and fixed dependencies, including in a standalone
// executable where import.meta.resolve cannot find packages on the filesystem.
// "dx" is the legacy specifier, accepted for one release with the legacy layout (spec D15).
const runtimeModules: Record<string, Record<string, unknown>> = { semlint, dx: semlint, zod, neverthrow };
plugin({
  name: "semlint-policy-runtime",
  setup(build) {
    build.onLoad({ filter: /.*/u, namespace: "semlint-runtime" }, (args) => ({
      exports: runtimeModules[args.path] ?? {},
      loader: "object",
    }));
  },
});

export function matches(patterns: string | readonly string[], path: string): boolean {
  const values = typeof patterns === "string" ? [patterns] : patterns;
  return values.some((pattern) => new Bun.Glob(pattern).match(path));
}
/** Rule files: the config file, everything under the policy directory, and [files] inputs. The one home for "what is policy". */
export function isPolicyPath(path: string, inputs: readonly string[]): boolean {
  return isLayoutPath(path) || matches(inputs, path);
}
export function reviewCommandRequirement(
  types: readonly z.infer<typeof typeSchema>[],
  config: Config,
) {
  if (types.some((type) => type.review !== undefined) && config.review.command === undefined)
    return undetermined('policy: semlint.toml: [review] command を書く（例: ["agx", "worker", "jev"]）');
  return ok(undefined);
}
export async function loadTypes(files: Readonly<Record<string, string>>) {
  return safeTry(async function* () {
    const dir = policyDir(Object.keys(files));
    const entries = Object.keys(files)
      .filter((p) => p.startsWith(dir) && /^[^/]+\.ts$/u.test(p.slice(dir.length)))
      .toSorted();
    if (entries.length === 0) return undetermined(`${dir}: no type definitions`);
    // Bundle revision sources in memory, then dynamically import them. Runtime onResolve
    // does not reliably intercept bare package imports in Bun 1.4.2; build hooks do.
    const entry =
      entries
        .map((path, index) => `import type${index} from ${JSON.stringify(`./${path}`)};`)
        .join("\n") + `\nexport default [${entries.map((_, index) => `type${index}`).join(",")}];`;
    const failures: string[] = [];
    const rejected = (text: string, importer: string) => {
      failures.push(`${importer.replace(/^.*\/dx-revision\//u, "")}: ${text}`);
      return { path: "/dx-revision/rejected.ts", namespace: "dx-revision" };
    };
    const result = await Bun.build({
      throw: false,
      entrypoints: ["/dx-revision/entry.ts"],
      root: "/",
      target: "bun",
      plugins: [
        {
          name: "dx-revision",
          setup(build) {
            build.onResolve({ filter: /.*/u }, (args) => {
              if (Object.hasOwn(runtimeModules, args.path))
                return {
                  path: `semlint-runtime:${args.path}`,
                  external: true,
                };
              if (args.path === "/dx-revision/entry.ts")
                return { path: args.path, namespace: "dx-revision" };
              if (!args.path.startsWith("."))
                return rejected(
                  `policy import must be relative, semlint, zod or neverthrow: ${args.path}`,
                  args.importer,
                );
              let path = posix.normalize(posix.join(posix.dirname(args.importer), args.path));
              if (!path.startsWith(`/dx-revision/${dir}`))
                return rejected(`policy import escapes ${dir}: ${path}`, args.importer);
              if (
                files[path.slice(13)] === undefined &&
                files[`${path.slice(13)}.ts`] !== undefined
              )
                path += ".ts";
              if (files[path.slice(13)] === undefined)
                return rejected(`missing revision module: ${path}`, args.importer);
              return { path, namespace: "dx-revision" };
            });
            build.onLoad({ filter: /.*/u, namespace: "dx-revision" }, (args) => {
              const contents =
                args.path === "/dx-revision/entry.ts" ? entry : files[args.path.slice(13)];
              if (contents === undefined && args.path !== "/dx-revision/rejected.ts")
                failures.push("missing revision module: " + args.path);
              return { contents: contents ?? "export default undefined;", loader: "ts" };
            });
          },
        },
      ],
    });
    if (failures.length > 0) return undetermined(`policy: ${failures.join("; ")}`);
    if (!result.success) {
      const log = result.logs.find((item) => item.level === "error") ?? result.logs[0];
      const path = log?.position?.file?.replace(/^.*\/dx-revision\//u, "") ?? entries[0];
      return undetermined(
        `policy: ${path}: ${log?.message.replaceAll(/\s*\n\s*/gu, " ") ?? "bundle failed"}`,
      );
    }
    const output = yield* requireValue(result.outputs[0], `${dir}: empty module build`);
    const code = await output.text();
    const module = yield* await ResultAsync.fromPromise<unknown, string>(
      import(
        `data:text/javascript;base64,${Buffer.from(code + "\n//# sourceURL=dx-policy.js").toString("base64")}`
      ),
      (error) => {
        const line =
          error instanceof Error ? /dx-policy\.js:(\d+):/u.exec(error.stack ?? "")?.[1] : undefined;
        const preceding = code.split("\n").slice(0, line === undefined ? 0 : Number(line));
        const path =
          preceding
            .flatMap((text) => /^\/\/ .*\/dx-revision\/(\.(?:dx|semlint)\/.*)$/u.exec(text)?.[1] ?? [])
            .at(-1) ?? entries[0];
        return `policy: ${path}: ${error instanceof Error ? error.message : String(error)}`;
      },
    );
    const frontmatterReview = z
      .object({
        default: z.array(
          z.looseObject({
            name: z.string(),
            review: z.looseObject({ place: z.string() }).optional(),
          }),
        ),
      })
      .safeParse(module);
    if (frontmatterReview.success) {
      const invalid = frontmatterReview.data.default.find(
        (type) => type.review?.place === "frontmatter",
      );
      if (invalid !== undefined)
        return undetermined(
          `policy: ${invalid.name}: review.place = "frontmatter" は消えた。"file:<glob>" を使う`,
        );
    }
    const definitions = z.object({ default: z.array(z.unknown()) }).safeParse(module);
    for (const definition of definitions.success ? definitions.data.default : [])
      yield* rejectRemovedLinkMatch(definition);
    const parsed = z.object({ default: z.array(typeSchema) }).safeParse(module);
    if (!parsed.success) return undetermined(`${dir}: ${parsed.error.message}`);
    const types = parsed.data.default;
    const views = new Set<string>();
    const names = new Set(types.map((t) => t.name));
    for (let index = 0; index < types.length; index += 1) {
      const type = types[index];
      if (type === undefined) continue;
      if (entries[index] !== `${dir}${type.name}.ts`)
        return undetermined(`type name must match file: ${entries[index]}`);
      const missingLink = Object.values(type.links)
        .flatMap((link) => (typeof link.to === "string" ? [link.to] : link.to))
        .find((name) => !names.has(name));
      if (missingLink !== undefined) return undetermined(`undeclared target type: ${missingLink}`);
      const duplicate = Object.keys(type.views).find((name) => views.has(name));
      if (duplicate !== undefined) return undetermined(`ambiguous view: ${duplicate}`);
      for (const name of Object.keys(type.views)) views.add(name);
    }
    return ok(types);
  });
}
