// Shared, dependency-free input validators for edge functions.
//
// AUDIT 2026-09-17: several functions parsed request bodies with
// `await req.json()` and used the values straight away. Anything that reaches
// the database, Bunny, MSG91 or Razorpay must be shape-checked at the boundary
// first. These helpers are intentionally boring and allocation-free.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** Bunny / provider video IDs: uuid, or a bounded alphanumeric+dash token. */
export function isVideoId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(v.trim());
}

/** Positive bigint-style ids (courses, lessons in older tables). */
export function isIntId(v: unknown): v is number | string {
  if (typeof v === "number") return Number.isInteger(v) && v > 0;
  return typeof v === "string" && /^[1-9]\d{0,18}$/.test(v.trim());
}

/**
 * Indian mobile → `91XXXXXXXXXX`, or null when it is not a plausible number.
 * Send and verify MUST share this so stored rows always match on lookup.
 */
export function normalizeIndianPhone(input: unknown): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return "91" + digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

export function isOtpCode(v: unknown): v is string {
  return typeof v === "string" && /^\d{6}$/.test(v.trim());
}

export function isText(v: unknown, min = 1, max = 1000): v is string {
  return typeof v === "string" && v.length >= min && v.length <= max;
}

export function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

/**
 * Storage-safe relative path: no traversal, no absolute paths, no NUL/control
 * characters, no protocol prefix. Callers still enforce their own prefixes.
 */
export function isSafeRelPath(v: unknown, maxLen = 512): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s || s.length > maxLen) return false;
  if (s.startsWith("/") || s.startsWith("\\")) return false;
  if (s.includes("..") || s.includes("://")) return false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/** Never throws: a malformed body becomes an empty object the caller rejects. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const parsed = await req.json();
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}
