/**
 * Cross-platform secure storage adapter.
 *
 * - Native (Android/iOS via Capacitor): uses @capacitor/preferences, which is
 *   backed by the Android Keystore-protected SharedPreferences and the iOS
 *   Keychain. Auth tokens are no longer exposed in WebView localStorage.
 * - Web (Lovable preview, Vercel): falls back to window.localStorage so the
 *   preview keeps working exactly as before.
 *
 * Implements the synchronous-looking interface Supabase's auth client expects
 * (getItem/setItem/removeItem may return Promise<string | null>).
 */
type Adapter = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const isNative = (): boolean => {
  try {
    return (globalThis as typeof globalThis & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

const webAdapter: Adapter = {
  getItem: (k) => {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(k) : null; }
    catch { return null; }
  },
  setItem: (k, v) => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); } catch { /* quota / private mode */ }
  },
  removeItem: (k) => {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(k); } catch { /* noop */ }
  },
};

let cachedNative: Adapter | null = null;

const loadNative = async (): Promise<Adapter> => {
  if (cachedNative) return cachedNative;
  const { Preferences } = await import('@capacitor/preferences');
  cachedNative = {
    getItem: async (k) => (await Preferences.get({ key: k })).value,
    setItem: async (k, v) => { await Preferences.set({ key: k, value: v }); },
    removeItem: async (k) => { await Preferences.remove({ key: k }); },
  };
  return cachedNative;
};

/**
 * One-shot migration: if a Supabase auth token currently lives in
 * window.localStorage (legacy installs), copy it into Preferences and erase
 * the localStorage copy. Idempotent — safe to call on every cold start.
 * Only runs on native; web is unchanged.
 */
let migrationStarted = false;
export const migrateLocalStorageTokensToPreferences = async (): Promise<void> => {
  if (migrationStarted || !isNative() || typeof window === 'undefined') return;
  migrationStarted = true;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('sb-') || k === 'supabase.auth.token')) keys.push(k);
    }
    for (const k of keys) {
      const v = window.localStorage.getItem(k);
      if (v == null) continue;
      const existing = await Preferences.get({ key: k });
      if (!existing.value) await Preferences.set({ key: k, value: v });
      window.localStorage.removeItem(k);
    }
  } catch {
    // best-effort; on failure session simply stays in localStorage
  }
};

/**
 * Storage adapter passed to createClient({ auth: { storage } }).
 *
 * The Supabase auth client calls these on every session read/write. On native
 * the first call lazily loads @capacitor/preferences (dynamic import keeps
 * web bundle clean). On web the calls are synchronous against localStorage.
 */
export const supabaseAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!isNative()) return webAdapter.getItem(key) as string | null;
    const a = await loadNative();
    return (await a.getItem(key)) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isNative()) { webAdapter.setItem(key, value); return; }
    const a = await loadNative();
    await a.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isNative()) { webAdapter.removeItem(key); return; }
    const a = await loadNative();
    await a.removeItem(key);
  },
};
