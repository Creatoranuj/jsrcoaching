import { useEffect, useState, useSyncExternalStore } from "react";
import { loadCore } from "@/lib/native/core";
import { useAuth } from "@/contexts/AuthContext";
import { safeGet, safeSet } from "@/lib/storage";

/**
 * Enables Android FLAG_SECURE while at least one component requests it.
 *
 * Ref-counted at module scope so multiple mounted instances don't toggle
 * the plugin on/off and don't register duplicate native handlers.
 *
 * ADMIN BEHAVIOR:
 * - Admin (verified server-side via `has_role`) gets a bypass so they can
 *   screen-record lessons to demo to students.
 * - Bypass is controllable per-device via a toggle in Admin → Security.
 *   Default: bypass ON (protection OFF) for admin. If admin toggles the
 *   setting to "enable protection", FLAG_SECURE applies to them like any
 *   normal user.
 * - Non-admin users: never bypassed.
 */

const ADMIN_OPT_IN_KEY = "nb_admin_screen_protection_enabled";

let activeCount = 0;
let pluginPromise: Promise<any | null> | null = null;
// Tri-state: `null` = unknown (never synced with native yet). We start here
// so the first reconcile ALWAYS makes an explicit enable()/disable() call,
// regardless of what the plugin's native default did at Activity onCreate.
// Without this, `disable()` was silently skipped and admins stayed trapped
// with FLAG_SECURE on. See capacitor.config.ts note on PrivacyScreen.enable.
let enabled: boolean | null = null;
let isAdminFlag = false;
// Fail-safe: until AuthContext resolves the role via `has_role` RPC,
// we don't know if this session is an admin. Treat as non-admin (protection
// ON) during that window rather than briefly bypassing FLAG_SECURE.
let roleResolved = false;
// When true, admin has explicitly opted into FLAG_SECURE (protection ON).
// When false (default), admin is bypassed.
let adminProtectionOptIn = safeGet(ADMIN_OPT_IN_KEY) === "1";

// Tiny pub/sub so the admin toggle UI stays in sync without extra state
// libraries.
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

function loadPlugin(): Promise<any | null> {
  if (pluginPromise) return pluginPromise;
  pluginPromise = (async () => {
    try {
      const { Capacitor } = await loadCore();
      if (!Capacitor.isNativePlatform()) return null;
      const mod: any = await import(
        /* @vite-ignore */ "@capacitor-community/privacy-screen"
      ).catch(() => null);
      return mod?.PrivacyScreen ?? null;
    } catch {
      return null;
    }
  })();
  return pluginPromise;
}

function shouldBeEnabled(): boolean {
  if (activeCount === 0) return false;
  // Fail-safe: if role hasn't been verified yet, keep protection ON.
  // We only bypass once we KNOW this user is an admin.
  if (!roleResolved) return true;
  // Admin is bypassed unless they've explicitly opted in.
  if (isAdminFlag && !adminProtectionOptIn) return false;
  return true;
}

async function reconcile(force = false) {
  const plugin = await loadPlugin();
  if (!plugin) return;
  const desired = shouldBeEnabled();
  // enabled === null → first reconcile, always issue an explicit call so JS
  // and native state converge. After that, only call on real transitions,
  // unless `force` (resume recovery) asks for a full off→on cycle.
  if (!force && enabled === desired) return;
  try {
    if (desired) {
      // Force path: tear the privacy overlay down first. Some OEM skins keep
      // the FLAG_SECURE blur surface on top of the WebView after a
      // background→resume cycle, which paints the PDF canvas black while
      // taps still reach React. A disable()→enable() round-trip clears it
      // without ever leaving the screen unprotected in a visible frame.
      if (force) {
        await plugin.disable?.().catch?.(() => {});
      }
      await plugin.enable?.();
      enabled = true;
    } else {
      await plugin.disable?.();
      enabled = false;
    }
  } catch {
    /* silent — leave `enabled` as-is so next reconcile retries */
  }
}

/**
 * Re-issue the native screen-protection state after an app resume.
 *
 * Idempotent and safe to call from anywhere; no-ops on web.
 * See the `force` branch in `reconcile()` for why the off→on cycle matters.
 */
export async function refreshScreenProtection(): Promise<void> {
  await reconcile(true);
}

if (typeof window !== "undefined") {
  window.addEventListener("app:resumed", () => {
    void refreshScreenProtection();
  });
}



function setAdminFlag(next: boolean, resolved: boolean) {
  const changed = isAdminFlag !== next || roleResolved !== resolved;
  isAdminFlag = next;
  roleResolved = resolved;
  if (changed) void reconcile();
}

/**
 * Read the current admin opt-in value (per-device).
 * Reactive via `useAdminScreenProtectionOptIn` below.
 */
export function getAdminScreenProtectionOptIn(): boolean {
  return adminProtectionOptIn;
}

/**
 * Toggle whether an admin device applies FLAG_SECURE.
 * `true`  → protection ON (admin blocked from recording, like a student).
 * `false` → protection OFF (admin can screen-record). This is the default.
 * Persists to localStorage so it survives reloads.
 */
export function setAdminScreenProtectionOptIn(next: boolean) {
  if (adminProtectionOptIn === next) return;
  adminProtectionOptIn = next;
  safeSet(ADMIN_OPT_IN_KEY, next ? "1" : "0");
  emit();
  void reconcile();
}

/**
 * React hook: subscribe to admin opt-in changes.
 * Returns [optIn, setOptIn]. Should only be surfaced in admin UI.
 */
export function useAdminScreenProtectionOptIn(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => adminProtectionOptIn,
    () => adminProtectionOptIn,
  );
  return [value, setAdminScreenProtectionOptIn];
}

/**
 * Boot-time baseline reconcile.
 *
 * IMPORTANT: must delegate to `reconcile()` — never call `plugin.disable()`
 * directly. A direct disable races with a LessonView that mounted first
 * (deep link / cold-start into a lesson) and silently strips FLAG_SECURE
 * off the protected screen. See mem://constraints/screen-protection.
 *
 * - No LessonView mounted → `activeCount === 0` → reconcile disables → baseline OFF.
 * - LessonView already mounted → reconcile keeps it enabled for non-admin students.
 * - Admin (bypass ON, default) → stays OFF everywhere.
 *
 * Safe to call multiple times.
 */
export async function bootstrapScreenProtection(): Promise<void> {
  await loadPlugin();
  await reconcile();
}

export function useScreenProtection(active: boolean = true): void {
  const { isAdmin, roleLoaded } = useAuth();

  // Keep the module-level admin flag in sync with the current session's role.
  // Fail-safe: while role is unresolved we treat as non-admin (protection ON).
  useEffect(() => {
    setAdminFlag(!!isAdmin, !!roleLoaded);
  }, [isAdmin, roleLoaded]);

  useEffect(() => {
    if (!active) return;
    activeCount += 1;
    void reconcile();
    return () => {
      activeCount = Math.max(0, activeCount - 1);
      void reconcile();
    };
  }, [active]);
}
