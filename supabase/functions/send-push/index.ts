// Admin broadcast push notification via FCM HTTP v1.
//
// Auth: caller MUST be an authenticated admin (has_role(uid,'admin')).
// Audit 2026-09-22: supabase/config.toml only disables verify_jwt for
// `app-download`; this function runs with the platform default (JWT verified
// at the gateway). The in-code admin check below is still the real security
// boundary (a valid student JWT passes the gateway) — never remove it.
//
// Secret required: FCM_SERVICE_ACCOUNT_JSON — the full Firebase service account
// JSON (project_id, client_email, private_key). Never stored in the database.
//
// Stale tokens (FCM UNREGISTERED / invalid registration token) are deleted
// from public.push_tokens instead of being retried.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { guardSwitch } from "../_shared/systemSwitch.ts";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_BATCH = 100;

/** Public update page — the only external link a push notification may carry. */
const UPDATE_PAGE_URL = "https://jsrcoaching.vercel.app/update";

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns the exact-size ArrayBuffer (not a Uint8Array view): newer Deno libs
// type `crypto.subtle.importKey`'s keyData as `BufferSource` over a plain
// ArrayBuffer, and a `Uint8Array<ArrayBufferLike>` no longer satisfies it.
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/** Exchange the service account for a short-lived FCM access token. */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token exchange returned no access_token");
  return json.access_token;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Survival Mode: admin ne is function ko band kiya ho to yahin ruk jao.
  const __switchOff = await guardSwitch("send-push", corsHeaders);
  if (__switchOff) return __switchOff;

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    const { data: isAdmin, error: roleErr } = await caller.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json(403, { error: "Forbidden" });

    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (!raw) return json(503, { error: "PUSH_NOT_CONFIGURED" });
    let sa: ServiceAccount;
    try {
      sa = JSON.parse(raw) as ServiceAccount;
    } catch {
      return json(503, { error: "PUSH_NOT_CONFIGURED" });
    }
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      return json(503, { error: "PUSH_NOT_CONFIGURED" });
    }

    let body: { title?: unknown; body?: unknown; path?: unknown; url?: unknown } = {};
    try { body = await req.json(); } catch { /* empty */ }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    const message = typeof body.body === "string" ? body.body.trim().slice(0, 500) : "";
    // Only same-app in-app paths — the client navigates with React Router.
    const path = typeof body.path === "string" && /^\/[A-Za-z0-9\-_/]*$/.test(body.path)
      ? body.path
      : "/install";
    // The ONLY external URL a push may carry is our own update page: the app
    // opens it in the phone's real browser, so anything else would be an open
    // redirect straight out of a notification. Exact match, no prefix check.
    const url = typeof body.url === "string" && body.url.trim() === UPDATE_PAGE_URL
      ? UPDATE_PAGE_URL
      : "";
    if (!title || !message) return json(400, { error: "INVALID_INPUT" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: 5 broadcasts per 10 min per admin.
    const { data: rlAllowed } = await admin.rpc("check_rate_limit", {
      _bucket: "send-push",
      _user_id: user.id,
      _max: 5,
      _window_seconds: 600,
    });
    if (rlAllowed === false) return json(429, { error: "RATE_LIMITED" });

    const { data: tokenRows, error: tokenErr } = await admin
      .from("push_tokens")
      .select("token");
    if (tokenErr) throw tokenErr;
    const tokens = (tokenRows ?? [])
      .map((r) => (r as { token: string }).token)
      .filter((t) => typeof t === "string" && t.length > 0);

    if (tokens.length === 0) {
      await admin.from("push_notifications_log").insert({
        title, body: message, target_path: path, sent_count: 0, failed_count: 0, sent_by: user.id,
      });
      return json(200, { sent: 0, failed: 0, total: 0 });
    }

    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    const stale: string[] = [];
    for (let i = 0; i < tokens.length; i += TOKEN_BATCH) {
      const batch = tokens.slice(i, i + TOKEN_BATCH);
      const results = await Promise.all(
        batch.map(async (token) => {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body: message },
                data: url ? { path, url } : { path },
                android: { priority: "HIGH", notification: { channel_id: "nb_default" } },
              },
            }),
          });
          if (res.ok) return { ok: true as const };
          const text = await res.text();
          // Sirf tab delete karo jab token sach me dead ho: FCM 404 (UNREGISTERED)
          // ya 400 jisme "UNREGISTERED" / "not a valid FCM registration token" ho.
          // Baaki INVALID_ARGUMENT (bad payload, TTL, etc.) par token mat hatao.
          const gone = res.status === 404 ||
            /UNREGISTERED|not a valid FCM registration token/i.test(text);
          if (!gone) console.error(`[send-push] FCM failed [${res.status}]: ${text.slice(0, 300)}`);
          return { ok: false as const, gone, token };
        }),
      );
      for (const r of results) {
        if (r.ok) sent++;
        else if (r.gone) stale.push(r.token);
      }
    }

    if (stale.length > 0) {
      await admin.from("push_tokens").delete().in("token", stale);
    }

    const failed = tokens.length - sent;
    await admin.from("push_notifications_log").insert({
      title, body: message, target_path: path, sent_count: sent, failed_count: failed, sent_by: user.id,
    });

    return json(200, { sent, failed, total: tokens.length, stale_removed: stale.length });
  } catch (e) {
    console.error("[send-push] unexpected error", e);
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
