// Session tracker — wires SIGNED_IN / SIGNED_OUT / heartbeat into the
// `user_sessions` table via the `manage-session` edge function. Without this,
// the Admin → Active Sessions panel is always empty.
import { supabase } from "@/integrations/supabase/client";
import { supabaseAuthStorage } from "@/lib/nativeStorage";

// Per-tab storage: sessionStorage is cleared when the tab closes and is not
// shared across origins/tabs, shrinking the XSS blast radius vs localStorage.
// The token is only used to keep the server-side session slot warm — a stolen
// value can't authenticate calls on its own (edge fn re-verifies the JWT).
const STORAGE_KEY = "nb.session_token.v1";
// Heartbeat interval — 5 min. Was 60s which caused ~1350 UPDATEs / window
// on user_sessions (top-6 slow query). 5 min keeps "last active" fresh
// enough for the Settings/Admin lists while cutting write volume ~5×.
// PERF 2026-09-20: 15 min, and skipped entirely while the tab/app is not
// visible. With 5 min + always-on this was ~4k UPDATEs per window.
const HEARTBEAT_MS = 15 * 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;
let inflightCreate: Promise<void> | null = null;

async function hasLiveSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch { return false; }
}

function getDeviceType(): string {
  try {
    // Lazy — avoid pulling Capacitor into initial bundle for pure web.
    const cap = (globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform) return cap.getPlatform(); // "ios" | "android" | "web"
  } catch { /* noop */ }
  return "web";
}

// PERF/UX 2026-09-20: the token used to live in sessionStorage, so every new
// tab or app relaunch created a BRAND NEW user_sessions row (4,019 inserts for
// ~30 accounts). It now lives in the persistent auth store (EncryptedShared-
// Preferences on Android, localStorage on web) so a relaunch reuses the same
// server-side session slot instead of writing a new one.
async function readToken(userId: string): Promise<string | null> {
  try {
    const raw = await supabaseAuthStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; token: string };
    return parsed.userId === userId ? parsed.token : null;
  } catch { return null; }
}

async function readRaw(): Promise<string | null> {
  try { return await supabaseAuthStorage.getItem(STORAGE_KEY); } catch { return null; }
}

async function writeToken(userId: string, token: string): Promise<void> {
  try { await supabaseAuthStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, token })); } catch { /* noop */ }
}

async function clearToken(): Promise<void> {
  try { await supabaseAuthStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  // Best-effort cleanup of entries written by earlier builds.
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function isVisible(): boolean {
  try {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  } catch { return true; }
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(token: string) {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!isVisible()) return; // app in background / tab hidden — nothing to report
    if (!(await hasLiveSession())) return; // avoid 401 when signed out
    supabase.functions
      .invoke("manage-session", { body: { action: "heartbeat", session_token: token } })
      .catch(() => { /* silent — best-effort */ });
  }, HEARTBEAT_MS);
}

export async function startSessionTracking(userId: string): Promise<void> {
  if (currentUserId === userId && heartbeatTimer) return; // already tracked
  currentUserId = userId;

  if (!(await hasLiveSession())) { currentUserId = null; return; }

  const existing = await readToken(userId);
  if (existing) { startHeartbeat(existing); return; }

  if (inflightCreate) return inflightCreate;
  inflightCreate = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-session", {
        body: {
          action: "create",
          device_type: getDeviceType(),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      if (error) return;
      const token = (data as { session_token?: string } | null)?.session_token;
      if (token) { await writeToken(userId, token); startHeartbeat(token); }
    } catch { /* silent */ }
    finally { inflightCreate = null; }
  })();
  return inflightCreate;
}

export async function stopSessionTracking(): Promise<void> {
  stopHeartbeat();
  const raw = await readRaw();
  await clearToken();
  currentUserId = null;
  if (!raw) return;
  // Must terminate BEFORE the JWT is torn down; if the session is already
  // gone, skip the call rather than firing an unauthenticated request that
  // the edge function will 401 on.
  if (!(await hasLiveSession())) return;
  try {
    const { token } = JSON.parse(raw) as { token: string };
    await supabase.functions.invoke("manage-session", {
      body: { action: "terminate", session_token: token },
    });
  } catch { /* silent */ }
}
