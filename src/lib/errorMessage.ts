/**
 * Shared helpers for working with values caught in `catch (err: unknown)`.
 *
 * TypeScript types caught values as `unknown` (the safe default). These helpers
 * narrow them without resorting to `any`.
 */

export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (typeof err === "string") return err || fallback;
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(getErrorMessage(err));
}
