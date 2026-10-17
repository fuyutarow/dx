import { err, ok, fromThrowable, ResultAsync, type Result, Ok, Err } from "neverthrow";
import type { z } from "zod";

export const message = (value: unknown): string =>
  value instanceof Error ? value.message : String(value);

/** Internal failures are values; only the CLI boundary chooses an exit code. */
export const undetermined = (reason: string): Result<never, string> => err(reason);
export const attempt = <T>(fn: () => T) => fromThrowable(fn, message)();
export const attemptAsync = <T>(fn: () => PromiseLike<T>) =>
  ResultAsync.fromPromise(Promise.resolve().then(fn), message);
export function requireValue<T>(value: T | undefined, reason: string): Result<T, string> {
  return value === undefined ? err(reason) : ok(value);
}
export function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
): Result<z.output<S>, string> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(parsed.error.message);
}
export const resultOf = <T>(value: T | Result<T, string>): Result<T, string> =>
  value instanceof Ok || value instanceof Err ? value : ok(value);
