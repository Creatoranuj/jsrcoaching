// Session tracker — wires SIGNED_IN / SIGNED_OUT / heartbeat into the
// `user_sessions` table via the `manage-session` edge function. Without this,
// the Admin → Active Sessions panel is always empty.
import { supabase } from "@/integrations/supabase/client";

// Per-tab storage: sessionStorage is cleared when the tab closes and is not
// shared across origins/tabs, shrinking the XSS blast radius vs localStorage.
// The token is only used to keep the server-side session slot warm — a stolen
// value can't authenticate calls on its own (edge fn re-verifies the JWT).
const STORAGE_KEY = "nb.session_token.v1";
// Heartbeat interval — 5 min. Was 60s which caused ~1350 UPDATEs / window
// on user_sessions (top-6 slow query). 5 min keeps "last active" fresh
// enough for the Settings/Admin lists while cutting write volume ~5×.
const HEARTBEAT_MS = 5 * 60_000;

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
    const cap = (globalThis as any).Capacitor;
    if (cap?.getPlatform) return cap.getPlatform(); // "ios" | "android" | "web"
  } catch { /* noop */ }
  return "web";
}

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function readToken(userId: string): string | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; token: string };
    return parsed.userId === userId ? parsed.token : null;
  } catch { return null; }
}

function writeToken(userId: string, token: string) {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ userId, token })); } catch { /* noop */ }
}

function clearToken() {
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* noop */ }
  // Best-effort cleanup of legacy localStorage entries from earlier builds.
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(token: string) {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
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

  const existing = readToken(userId);
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
      if (token) { writeToken(userId, token); startHeartbeat(token); }
    } catch { /* silent */ }
    finally { inflightCreate = null; }
  })();
  return inflightCreate;
}

export async function stopSessionTracking(): Promise<void> {
  stopHeartbeat();
  const raw = (() => { try { return storage()?.getItem(STORAGE_KEY) ?? null; } catch { return null; } })();
  clearToken();
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
