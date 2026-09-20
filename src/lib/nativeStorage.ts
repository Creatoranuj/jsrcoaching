/**
 * Auth-session storage adapter.
 *
 * Priority on Android/iOS (Capacitor):
 *   1. `SecureStore` — our own plugin backed by EncryptedSharedPreferences,
 *      i.e. an AES-256 key held in the Android Keystore (TEE/StrongBox).
 *      See android/app/src/main/java/com/jsrcoaching/app/SecureStorePlugin.java
 *   2. `@capacitor/preferences` — app-private but NOT encrypted. Used only when
 *      the device's Keystore is broken, so login never hard-fails.
 *   3. `localStorage` — web only.
 *
 * On the web (Vercel site and the Lovable preview) nothing changes: the caller
 * keeps using its own storage, because there is no native keystore there.
 *
 * HISTORY / CORRECTION: an earlier version of this file claimed Preferences was
 * "Keystore-backed". It is not — it is a plain SharedPreferences XML file. That
 * wrong comment is what this module now fixes, together with the actual move to
 * encrypted storage and a one-shot migration of any legacy plaintext copy.
 */

type Adapter = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export const isNativeRuntime = (): boolean => {
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

type SecureStorePlugin = {
  isAvailable: () => Promise<{ available: boolean }>;
  get: (o: { key: string }) => Promise<{ value: string | null }>;
  set: (o: { key: string; value: string }) => Promise<void>;
  remove: (o: { key: string }) => Promise<void>;
};

const loadPreferencesAdapter = async (): Promise<Adapter> => {
  const { Preferences } = await import('@capacitor/preferences');
  return {
    getItem: async (k) => (await Preferences.get({ key: k })).value,
    setItem: async (k, v) => { await Preferences.set({ key: k, value: v }); },
    removeItem: async (k) => { await Preferences.remove({ key: k }); },
  };
};

/** true once the encrypted store has been confirmed working on this device. */
let secureConfirmed = false;

const loadSecureAdapter = async (): Promise<Adapter | null> => {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const SecureStore = registerPlugin<SecureStorePlugin>('SecureStore');
    const { available } = await SecureStore.isAvailable();
    if (!available) return null;
    secureConfirmed = true;
    return {
      getItem: async (k) => (await SecureStore.get({ key: k })).value,
      setItem: async (k, v) => { await SecureStore.set({ key: k, value: v }); },
      removeItem: async (k) => { await SecureStore.remove({ key: k }); },
    };
  } catch {
    // Plugin missing (older installed APK, iOS build without it) → caller falls
    // back to Preferences.
    return null;
  }
};

let cachedNative: Promise<Adapter> | null = null;

const nativeAdapter = (): Promise<Adapter> => {
  if (!cachedNative) {
    cachedNative = (async () => {
      const secure = await loadSecureAdapter();
      const adapter = secure ?? (await loadPreferencesAdapter());
      await migrateLegacyTokens(adapter);
      return adapter;
    })();
  }
  return cachedNative;
};

const isAuthKey = (k: string): boolean => k.startsWith('sb-') || k === 'supabase.auth.token';

/**
 * One-shot migration of any session token still sitting in plaintext.
 *
 * Reads legacy copies from WebView localStorage AND from @capacitor/preferences,
 * writes them into the target adapter (normally the encrypted store) and wipes
 * the plaintext originals. Idempotent and best-effort: a failure here must never
 * log the student out.
 */
const migrateLegacyTokens = async (target: Adapter): Promise<void> => {
  try {
    // 1. localStorage (oldest installs)
    if (typeof window !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && isAuthKey(k)) keys.push(k);
      }
      for (const k of keys) {
        const v = window.localStorage.getItem(k);
        if (v == null) continue;
        if (!(await target.getItem(k))) await target.setItem(k, v);
        window.localStorage.removeItem(k);
      }
    }

    // 2. Preferences (installs that ran the previous adapter). Only worth doing
    //    when the target is the encrypted store — otherwise it IS the source.
    if (secureConfirmed) {
      const { Preferences } = await import('@capacitor/preferences');
      const { keys } = await Preferences.keys();
      for (const k of keys.filter(isAuthKey)) {
        const { value } = await Preferences.get({ key: k });
        if (value == null) continue;
        if (!(await target.getItem(k))) await target.setItem(k, value);
        await Preferences.remove({ key: k });
      }
    }
  } catch {
    // best-effort; session simply stays where it was
  }
};

/**
 * Storage adapter for `createClient({ auth: { storage } })` on native.
 * Web callers should keep using their own (preview-brokered) storage.
 */
export const supabaseAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!isNativeRuntime()) return webAdapter.getItem(key) as string | null;
    return (await (await nativeAdapter()).getItem(key)) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isNativeRuntime()) { webAdapter.setItem(key, value); return; }
    await (await nativeAdapter()).setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isNativeRuntime()) { webAdapter.removeItem(key); return; }
    await (await nativeAdapter()).removeItem(key);
  },
};

/** Test-only: forget the resolved adapter so a new runtime can be simulated. */
export const __resetNativeStorageForTests = (): void => {
  cachedNative = null;
  secureConfirmed = false;
};
