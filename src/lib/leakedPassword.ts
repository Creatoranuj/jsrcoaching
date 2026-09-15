/**
 * Leaked-password protection.
 *
 * Checks a candidate password against the Have I Been Pwned breach corpus using
 * the k-anonymity range API: only the first 5 hex chars of the SHA-1 digest ever
 * leave the device, so the password itself is never transmitted.
 *
 * This runs on every credential-setting path (signup, reset, change) alongside
 * the local common-password list. Fails open on network errors so a flaky
 * connection can never lock a student out of resetting their own password.
 */

export interface LeakedPasswordResult {
  /** True only when the password was positively found in a breach corpus. */
  breached: boolean;
  /** Number of times it appeared, when known. */
  count: number;
  /** True when the check could not be completed (offline, blocked, timeout). */
  unknown: boolean;
}

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 4000;

async function sha1Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function checkLeakedPassword(password: string): Promise<LeakedPasswordResult> {
  const unknownResult: LeakedPasswordResult = { breached: false, count: 0, unknown: true };
  if (!password) return unknownResult;

  let hash: string | null;
  try {
    hash = await sha1Hex(password);
  } catch {
    return unknownResult;
  }
  if (!hash) return unknownResult;

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) return unknownResult;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [lineSuffix, rawCount] = line.trim().split(":");
      if (lineSuffix === suffix) {
        const count = Number(rawCount) || 0;
        // Padded responses use a count of 0 for synthetic rows.
        if (count <= 0) return { breached: false, count: 0, unknown: false };
        return { breached: true, count, unknown: false };
      }
    }
    return { breached: false, count: 0, unknown: false };
  } catch {
    return unknownResult;
  } finally {
    clearTimeout(timer);
  }
}

export const LEAKED_PASSWORD_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different one.";

/**
 * Convenience guard: returns an error message when the password is breached,
 * otherwise null.
 */
export async function leakedPasswordError(password: string): Promise<string | null> {
  const result = await checkLeakedPassword(password);
  return result.breached ? LEAKED_PASSWORD_MESSAGE : null;
}
