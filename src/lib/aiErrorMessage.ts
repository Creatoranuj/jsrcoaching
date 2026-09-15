/**
 * Single source of truth for turning an AI edge-function failure into student
 * facing copy.
 *
 * Why this exists: ChatWidget used to branch on `/api_key|gateway/` against the
 * raw error *message*, so a plain timeout (`gateway_timeout`) or a transient
 * 5xx (`gateway_502`) was reported as "🔑 server key issue" and pushed students
 * to message the admin about a key that was perfectly healthy. Classification
 * must be driven by the machine-readable `code` first, then the HTTP status —
 * never by substring-matching prose.
 */

export interface AiErrorInput {
  /** `code` field returned by the edge function body, when present. */
  code?: string | null;
  /** HTTP status of the failed function call. */
  status?: number | null;
  /** Raw error message (used only as a last-resort hint). */
  message?: string | null;
}

const KEY_ISSUE =
  "🔑 AI service अभी available नहीं है (server key issue). नीचे Retry दबाएँ — फिर भी न चले तो admin को बताएँ।";
const CREDITS = "💳 AI credits ख़त्म हो गए हैं। Admin से contact करें।";
const RATE = "⏳ बहुत ज़्यादा requests — 1 minute रुक कर फिर try करें।";
const SLOW = "⏳ AI ने जवाब देने में ज़्यादा समय लिया — नीचे Retry दबाएँ। 🙏";
const SESSION = "🔒 Session expire हो गया — page refresh करें।";
const SERVER = "🛠️ Server पर दिक़्क़त है — थोड़ी देर बाद try करें।";
const OFFLINE = "📶 Internet connection check करें और फिर try करें।";
const GENERIC = "🔧 Connection में problem है। थोड़ी देर बाद try करें। 🙏";

/** Only these codes mean the gateway credential itself is broken. */
export function isAiKeyFailure(input: AiErrorInput): boolean {
  const code = (input.code || "").toLowerCase();
  const msg = (input.message || "").toLowerCase();
  return (
    code === "gateway_unauthorized" ||
    code === "not_configured" ||
    msg.includes("lovable_api_key_not_registered")
  );
}

export function friendlyAiError(input: AiErrorInput): string {
  const code = (input.code || "").toLowerCase();
  const status = input.status ?? undefined;
  const msg = (input.message || "").toLowerCase();

  if (isAiKeyFailure(input)) return KEY_ISSUE;
  if (code === "credits_exhausted" || status === 402 || /payment_required/.test(msg)) return CREDITS;
  if (code === "rate_limited" || status === 429) return RATE;
  if (code === "gateway_timeout" || status === 504 || /timeout|aborted/.test(msg)) return SLOW;
  // 401 from Supabase means the *user's* JWT was rejected, not the AI key.
  if (status === 401) return SESSION;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  if (/failed to fetch|networkerror|load failed/.test(msg)) return OFFLINE;
  if (status !== undefined && status >= 500) return SERVER;
  return GENERIC;
}

export const AI_ERROR_COPY = { KEY_ISSUE, CREDITS, RATE, SLOW, SESSION, SERVER, OFFLINE, GENERIC };
