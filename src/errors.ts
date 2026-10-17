import { fromThrowable, ResultAsync } from "neverthrow";

export const message = (value: unknown): string =>
  value instanceof Error ? value.message : String(value);

/** Internal abort; caught at the process boundary before any stdout is emitted. */
export function undetermined(reason: string): never {
  throw new Error(reason);
}
export const attempt = <T>(fn: () => T) => fromThrowable(fn, message)();
export const attemptAsync = <T>(fn: () => Promise<T>) =>
  ResultAsync.fromPromise(Promise.resolve().then(fn), message);
export function requireValue<T>(value: T | undefined, reason: string): T {
  return value === undefined ? undetermined(reason) : value;
}
