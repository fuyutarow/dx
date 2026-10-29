import { ok, type Result } from "neverthrow";
import { undetermined } from "./errors.ts";

export type Layout = { readonly config: string; readonly dir: string };
export const CURRENT: Layout = { config: "semlint.toml", dir: ".semlint/" };

export function isLayoutPath(path: string): boolean {
  return path === CURRENT.config || path.startsWith(CURRENT.dir);
}

export function layoutOf(paths: Iterable<string>): Result<Layout | undefined, string> {
  const all = [...paths];
  if (all.some((path) => path === "dx.toml" || path.startsWith(".dx/")))
    return undetermined("dx.toml と .dx/ は読まない。semlint.toml（先頭に edition = 1）と .semlint/ に移す");
  return ok(all.includes(CURRENT.config) ? CURRENT : undefined);
}

export function policyDir(_paths: Iterable<string>): string {
  return CURRENT.dir;
}
