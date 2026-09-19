// Server-side error reporting for edge functions.
//
// AUDIT 2026-09-17: none of the 44 edge functions persisted their failures.
// Function logs are ephemeral, so a payment or playback failure left no trace
// after the fact. This module writes scrubbed errors to public.error_logs via
// the service role, and — just by being imported — captures console.error and
// unhandled promise rejections as a safety net.
//
// Rules:
//   * never throw (reporting must not break the request);
//   * never expose internals to the caller (callers still return safe envelopes);
//   * never persist credentials or OTPs (see scrub()).
//
// Usage:
//   import "../_shared/errorReporting.ts";                 // passive capture
//   import { reportError } from "../_shared/errorReporting.ts";
//   await reportError(err, { surface: "bunny-cdn", stage: "upload", userId });

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// The edge runtime has no generated Database types, so supabase-js would type
// the error_logs insert row as `never[]`. Wrap the client in a minimal
// structural facade (same runtime object) so every function importing this
// helper stays `deno check` clean.
interface InsertResult {
  error: { message: string } | null;
}
interface ErrorLogsClient {
  from(table: "error_logs"): {
    insert(row: Record<string, unknown>): PromiseLike<InsertResult>;
  };
}
let cached: ErrorLogsClient | null = null;
function admin(): ErrorLogsClient {
  if (!cached) cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as unknown as ErrorLogsClient;
  return cached;
}

const MAX_MESSAGE = 5000;
const MAX_STACK = 20000;

/** Redact anything that looks like a credential or a one-time code. */
function scrub(input: string): string {
  return input
    // JWTs / Supabase keys
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[redacted-jwt]")
    .replace(/\b(sb_[a-z]+_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{8,})\b/g, "[redacted-key]")
    // provider keys
    .replace(/\b(rzp_(live|test)_[A-Za-z0-9]{6,}|sk_[A-Za-z0-9]{10,})\b/g, "[redacted-key]")
    // Authorization / AccessKey / authkey headers and token query params
    .replace(/(authorization|accesskey|authkey|apikey|api[-_]?key|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/([?&](?:token|authkey|apikey)=)[^&\s]+/gi, "$1[redacted]")
    // bare 6-digit OTPs next to an otp label
    .replace(/(otp\D{0,10})\d{6}\b/gi, "$1[redacted]");
}

function describe(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      message: scrub(err.message).slice(0, MAX_MESSAGE),
      stack: err.stack ? scrub(err.stack).slice(0, MAX_STACK) : null,
    };
  }
  if (typeof err === "string") return { message: scrub(err).slice(0, MAX_MESSAGE), stack: null };
  try {
    return { message: scrub(JSON.stringify(err)).slice(0, MAX_MESSAGE), stack: null };
  } catch {
    return { message: String(err).slice(0, MAX_MESSAGE), stack: null };
  }
}

export interface ReportContext {
  /** Function name, e.g. "bunny-cdn". */
  surface: string;
  /** Step inside the function, e.g. "upload". */
  stage?: string;
  userId?: string | null;
  [key: string]: unknown;
}

export async function reportError(err: unknown, ctx: ReportContext): Promise<void> {
  const { message, stack } = describe(err);
  const label = ctx.stage ? `${ctx.surface}:${ctx.stage}` : ctx.surface;
  console.error(`[${label}] ${message}`);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  const { surface: _s, stage: _st, userId, ...rest } = ctx;
  try {
    await admin().from("error_logs").insert({
      error_type: `edge:${label}`,
      message,
      stack_trace: stack,
      user_id: userId ?? null,
      url: `edge://${ctx.surface}`,
      user_agent: "supabase-edge-function",
      metadata: JSON.parse(scrub(JSON.stringify({ stage: ctx.stage ?? null, ...rest }))),
    });
  } catch (e) {
    // Reporting must never break the request it is reporting on.
    console.error(`[errorReporting] persist failed: ${(e as Error).message}`);
  }
}

/** Best-effort surface name when we only have a stack (passive capture). */
function surfaceFromStack(): string {
  const line = new Error().stack?.split("\n").find((l) => l.includes("/functions/")) ?? "";
  return line.match(/\/functions\/([^/]+)\//)?.[1] ?? "unknown";
}

// ── Passive capture: importing this module is enough ──
let installed = false;
if (!installed) {
  installed = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    try {
      // Don't recurse on our own persist failures.
      const parts = args.map((a) => describe(a).message).join(" ");
      if (parts.includes("[errorReporting]")) return;
      const errArg = args.find((a) => a instanceof Error);
      const { stack } = describe(errArg ?? null);
      if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
      void admin().from("error_logs").insert({
        error_type: `edge:${surfaceFromStack()}`,
        message: parts.slice(0, MAX_MESSAGE),
        stack_trace: stack,
        url: `edge://${surfaceFromStack()}`,
        user_agent: "supabase-edge-function",
        metadata: { capture: "console.error" },
      });
    } catch {
      // ignore
    }
  };

  addEventListener("unhandledrejection", (ev) => {
    void reportError((ev as PromiseRejectionEvent).reason, {
      surface: surfaceFromStack(),
      stage: "unhandledrejection",
    });
  });
}
