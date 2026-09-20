import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Auth token at rest.
 *
 * Guards the 2026-09-20 hardening: on native the Supabase session must go into
 * the Keystore-encrypted SecureStore, any plaintext copy left behind in
 * localStorage / Preferences must be migrated away, and a device with a broken
 * Keystore must still be able to log in (Preferences fallback).
 */

const secureMem = new Map<string, string>();
const prefsMem = new Map<string, string>();
let secureAvailable = true;
let securePluginPresent = true;

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => {
    if (!securePluginPresent) throw new Error("plugin missing");
    return {
      isAvailable: async () => ({ available: secureAvailable }),
      get: async ({ key }: { key: string }) => ({ value: secureMem.get(key) ?? null }),
      set: async ({ key, value }: { key: string; value: string }) => { secureMem.set(key, value); },
      remove: async ({ key }: { key: string }) => { secureMem.delete(key); },
    };
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefsMem.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { prefsMem.set(key, value); },
    remove: async ({ key }: { key: string }) => { prefsMem.delete(key); },
    keys: async () => ({ keys: [...prefsMem.keys()] }),
  },
}));

const AUTH_KEY = "sb-wegamscqtvqhxowlskfm-auth-token";

const loadModule = async () => {
  const mod = await import("@/lib/nativeStorage");
  mod.__resetNativeStorageForTests();
  return mod;
};

beforeEach(() => {
  secureMem.clear();
  prefsMem.clear();
  secureAvailable = true;
  securePluginPresent = true;
  window.localStorage.clear();
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
});

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe("native auth storage", () => {
  it("writes the session into the encrypted store, not Preferences", async () => {
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.setItem(AUTH_KEY, "session-json");

    expect(secureMem.get(AUTH_KEY)).toBe("session-json");
    expect(prefsMem.has(AUTH_KEY)).toBe(false);
    expect(await supabaseAuthStorage.getItem(AUTH_KEY)).toBe("session-json");
  });

  it("migrates a legacy localStorage token and erases the plaintext copy", async () => {
    window.localStorage.setItem(AUTH_KEY, "legacy-session");
    const { supabaseAuthStorage } = await loadModule();

    expect(await supabaseAuthStorage.getItem(AUTH_KEY)).toBe("legacy-session");
    expect(secureMem.get(AUTH_KEY)).toBe("legacy-session");
    expect(window.localStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it("migrates a legacy Preferences token and erases the plaintext copy", async () => {
    prefsMem.set(AUTH_KEY, "prefs-session");
    const { supabaseAuthStorage } = await loadModule();

    expect(await supabaseAuthStorage.getItem(AUTH_KEY)).toBe("prefs-session");
    expect(secureMem.get(AUTH_KEY)).toBe("prefs-session");
    expect(prefsMem.has(AUTH_KEY)).toBe(false);
  });

  it("leaves non-auth keys alone", async () => {
    window.localStorage.setItem("nb:theme", "dark");
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.getItem(AUTH_KEY);

    expect(window.localStorage.getItem("nb:theme")).toBe("dark");
    expect(secureMem.has("nb:theme")).toBe(false);
  });

  it("falls back to Preferences when the device Keystore is broken", async () => {
    secureAvailable = false;
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.setItem(AUTH_KEY, "fallback-session");

    expect(prefsMem.get(AUTH_KEY)).toBe("fallback-session");
    expect(await supabaseAuthStorage.getItem(AUTH_KEY)).toBe("fallback-session");
  });

  it("falls back when the plugin is missing (older installed build)", async () => {
    securePluginPresent = false;
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.setItem(AUTH_KEY, "old-apk");

    expect(prefsMem.get(AUTH_KEY)).toBe("old-apk");
  });

  it("removeItem clears the session everywhere", async () => {
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.setItem(AUTH_KEY, "bye");
    await supabaseAuthStorage.removeItem(AUTH_KEY);

    expect(secureMem.has(AUTH_KEY)).toBe(false);
    expect(await supabaseAuthStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it("on web it never touches the native plugins", async () => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    const { supabaseAuthStorage } = await loadModule();
    await supabaseAuthStorage.setItem(AUTH_KEY, "web-session");

    expect(window.localStorage.getItem(AUTH_KEY)).toBe("web-session");
    expect(secureMem.size).toBe(0);
    expect(prefsMem.size).toBe(0);
  });
});
