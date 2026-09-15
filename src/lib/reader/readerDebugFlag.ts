import { safeGet } from "@/lib/storage";

/**
 * Reader diagnostics gate.
 *
 * On in dev builds; in production only when the session opted in
 * (`localStorage.nb_reader_debug = "1"`, the same switch the admin debug
 * tooling flips). Keeping this a plain function means callers pay one
 * boolean check and the panel chunk is never fetched otherwise.
 */
export function readerDebugEnabled(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    return safeGet("nb_reader_debug") === "1";
  } catch {
    return false;
  }
}
