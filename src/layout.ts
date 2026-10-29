import { ok, type Result } from "neverthrow";
import { undetermined } from "./errors.ts";

export type Layout = { readonly config: string; readonly dir: string };
export const CURRENT: Layout = { config: "semlint.toml", dir: ".semlint/" };
const LEGACY: Layout = { config: "dx.toml", dir: ".dx/" };

export function isLayoutPath(path: string): boolean {
  return [CURRENT, LEGACY].some((layout) => path === layout.config || path.startsWith(layout.dir));
}

export function historicalLayout(paths: Iterable<string>): Layout | undefined {
  const all = [...paths];
  if (all.some((path) => path === LEGACY.config || path.startsWith(LEGACY.dir))) return undefined;
  return all.includes(CURRENT.config) ? CURRENT : undefined;
}

export function layoutOf(paths: Iterable<string>): Result<Layout | undefined, string> {
  const all = [...paths];
  if (all.some((path) => path === LEGACY.config || path.startsWith(LEGACY.dir)))
    return undetermined(
      "dx.toml と .dx/ は読まない。semlint.toml（先頭に edition = 1）と .semlint/ に移す",
    );
  return ok(all.includes(CURRENT.config) ? CURRENT : undefined);
}

export function policyDir(_paths: Iterable<string>): string {
  return CURRENT.dir;
}
