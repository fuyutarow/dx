import { ok, type Result } from "neverthrow";
import { undetermined } from "./errors.ts";

/** Where a revision keeps its configuration and policy modules. */
export type Layout = { readonly config: string; readonly dir: string; readonly legacy: boolean };
export const CURRENT: Layout = { config: "semlint.toml", dir: ".semlint/", legacy: false };
/** The dx names, read for one release so repositories can migrate (spec D15). */
export const LEGACY: Layout = { config: "dx.toml", dir: ".dx/", legacy: true };
const LAYOUTS = [CURRENT, LEGACY] as const;

export function isLayoutPath(path: string): boolean {
  return LAYOUTS.some((layout) => path === layout.config || path.startsWith(layout.dir));
}

/** One layout per revision: a mixed or doubled layout has no single authority. */
export function layoutOf(paths: Iterable<string>): Result<Layout | undefined, string> {
  const all = [...paths];
  const configs = LAYOUTS.filter((layout) => all.includes(layout.config));
  const dirs = LAYOUTS.filter((layout) => all.some((path) => path.startsWith(layout.dir)));
  if (configs.length > 1)
    return undetermined("semlint.toml と dx.toml が両方ある。dx.toml を消して semlint.toml だけにする");
  const layout = configs[0];
  const stray = dirs.find((dir) => dir !== layout);
  if (stray !== undefined)
    return undetermined(
      layout === undefined
        ? `${stray.dir} があるのに ${stray.config} が無い`
        : `${layout.config} と ${stray.dir} は組にならない。${stray.dir} を ${layout.dir} に移す`,
    );
  return ok(layout);
}

/** The policy directory of files already read under one admitted layout. */
export function policyDir(paths: Iterable<string>): string {
  return [...paths].some((path) => path.startsWith(CURRENT.dir)) ? CURRENT.dir : LEGACY.dir;
}

export function legacyNotice(layout: Layout): string {
  return layout.legacy
    ? "semlint: dx.toml と .dx/ は旧い配置。semlint.toml（先頭に edition = 1）と .semlint/ に移す。次の版で読まなくなる\n"
    : "";
}
