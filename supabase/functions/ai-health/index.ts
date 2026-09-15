// Lightweight AI gateway health probe. Public (no auth) and cached 30s.
// Client (e.g. useLessonChat) calls once on mount to show a soft
// "reconnecting" banner instead of letting the first user turn fail hard
// with a raw "non-2xx" toast.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRole } from "../_shared/auth.ts";
import {
  callAiGateway,
  isGatewayAuthFailure,
  DEFAULT_CHAT_MODEL,
  SUPPORTED_CHAT_MODELS,
} from "../_shared/aiGateway.ts";

let cache: { at: number; body: unknown; status: number } | null = null;
const TTL_MS = 30_000;

/**
 * Admin-only deep probe: returns the REAL upstream status and the first bytes
 * of the gateway body for the exact model both chat features use, so a
 * "server key issue" report can be confirmed or ruled out from the app.
 * Never returns the key itself.
 */
async function runDiagnostics(req: Request, corsHeaders: Record<string, string>) {
  const auth = await requireRole(req, corsHeaders, ["admin"]);
  if (!auth.ok) return auth.response;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const checks: Record<string, unknown>[] = [];

  // Which model the chatbot will actually use, after allowlist resolution.
  let configuredModel: string | null = null;
  let effectiveModel = DEFAULT_CHAT_MODEL;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin.from("chatbot_settings").select("model").eq("id", 1).maybeSingle();
    configuredModel = (data as { model?: string } | null)?.model ?? null;
    const candidate = String(configuredModel || "").trim();
    const normalized = candidate.includes("/") ? candidate : candidate ? `google/${candidate}` : "";
    effectiveModel = (SUPPORTED_CHAT_MODELS as readonly string[]).includes(normalized)
      ? normalized
      : DEFAULT_CHAT_MODEL;
  } catch (e) {
    checks.push({ name: "chatbot_settings", ok: false, detail: (e as Error).message });
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        keyPresent: false,
        configuredModel,
        effectiveModel,
        checks: [{ name: "gateway", ok: false, code: "not_configured" }],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  for (const model of [effectiveModel, DEFAULT_CHAT_MODEL].filter((m, i, a) => a.indexOf(m) === i)) {
    const started = Date.now();
    try {
      const res = await callAiGateway({
        apiKey,
        body: { model, messages: [{ role: "user", content: "ping" }], max_tokens: 8 },
        attempts: 1,
        timeoutMs: 15000,
      });
      const text = res.ok ? "" : await res.text().catch(() => "");
      checks.push({
        name: `gateway:${model}`,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        code: res.ok
          ? undefined
          : isGatewayAuthFailure(res.status, text)
            ? "gateway_unauthorized"
            : `gateway_${res.status}`,
        upstream: text.slice(0, 300) || undefined,
      });
    } catch (e) {
      checks.push({ name: `gateway:${model}`, ok: false, code: "network_error", detail: (e as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ keyPresent: true, configuredModel, effectiveModel, checks }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (new URL(req.url).searchParams.get("diag") === "1") {
    return await runDiagnostics(req, corsHeaders);
  }

  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return new Response(JSON.stringify(cache.body), {
      status: cache.status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    const body = { ok: false, code: "not_configured" };
    cache = { at: now, body, status: 200 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await callAiGateway({
      apiKey,
      body: {
        model: "google/gemini-3.6-flash", // redeploy tag 2026-07-31 (key rotation)
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      },
    });

    let body: Record<string, unknown> = { ok: res.ok };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isAuth =
        (res.status === 401 || res.status === 403) &&
        (text.includes("lovable_api_key_not_registered") || text.includes("unauthorized"));
      body = {
        ok: false,
        code: isAuth ? "gateway_unauthorized" : `gateway_${res.status}`,
      };
    }
    cache = { at: now, body, status: 200 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const body = { ok: false, code: "network_error", detail: (e as Error).message };
    // Don't cache network errors — they may resolve quickly.
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
