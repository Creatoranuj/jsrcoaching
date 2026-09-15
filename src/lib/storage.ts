/**
 * soft-touch storage wrapper.
 *
 * Direct localStorage access throws in:
 *  - Safari private mode (quota errors)
 *  - iOS WKWebView with cookies disabled
 *  - SSR / node contexts (`localStorage` undefined)
 *
 * This module gives every caller a bounded, JSON-aware, try/catch-guarded
 * API so we stop leaking `SecurityError`/`QuotaExceededError` into React
 * render paths. Prefer `safeGetJSON`/`safeSetJSON` for objects.
 *
 * Migration strategy: land the wrapper, migrate hottest call sites first
 * (auth, cart, theme, sw-registration, haptics). Do NOT bulk-rewrite the
 * 80+ scattered call sites in one go — they land per feature.
 */

const hasLocalStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
};

export function safeGet(key: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): boolean {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded or private-mode Safari — swallow so callers don't crash.
    return false;
  }
}

export function safeRemove(key: string): boolean {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeGetJSON<T = unknown>(key: string, fallback: T): T {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted value — remove so future reads don't keep failing.
    safeRemove(key);
    return fallback;
  }
}

export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** Session storage variants for tab-scoped, ephemeral data. */
const hasSessionStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
};

export function safeSessionGet(key: string): string | null {
  if (!hasSessionStorage()) return null;
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

export function safeSessionSet(key: string, value: string): boolean {
  if (!hasSessionStorage()) return false;
  try { window.sessionStorage.setItem(key, value); return true; } catch { return false; }
}
