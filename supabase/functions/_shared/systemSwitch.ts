// Server-side kill-switch guard.
//
// Client par feature chhupa dena kaafi nahi hai — koi seedha function call kar
// sakta hai. Isliye har switchable function apni shuruaat me `guardSwitch()`
// call karta hai. Switch OFF hone par function 503 lautata hai aur andar ka
// koi kaam (AI credits, third-party API, DB writes) hota hi nahi.
//
// Niyam client wale jaise hi:
// - key missing = ON (aaj ka behaviour nahi badalta)
// - PROTECTED function kabhi band nahi hote, DB me kuch bhi likha ho
// - site_settings padhne me error = ON (fail-open; guard kabhi outage ki wajah
//   na bane)
//
// Read 60 second tak cache hoti hai, isliye ye guard har request par DB hit
// nahi karta.

import { createClient } from "npm:@supabase/supabase-js@2";

/** Ye function hamesha chalte hain — inhe guard mat karo. */
const PROTECTED_FUNCTIONS = new Set<string>([
  "send-phone-otp",
  "verify-phone-otp",
  "manage-session",
  "get-lesson-url",
  "get-video-stream",
  "pdf-proxy",
  "resolve-storage-pdf",
  "create-razorpay-order",
  "create-subscription-order",
  "verify-razorpay-payment",
  "verify-subscription-payment",
  "razorpay-webhook",
  "razorpay-refund-webhook",
  "self-enroll-free",
  "start-subscription-trial",
  "score-quiz",
  "admin-register",
  "setup-admin",
]);

const CACHE_TTL_MS = 60_000;

let cache: Record<string, boolean> | null = null;
let cachedAt = 0;

export function switchKey(fn: string): string {
  return `sys_edge_${fn.replace(/-/g, "_")}`;
}

function parseValue(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  if (v === "") return true;
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

async function loadSwitches(): Promise<Record<string, boolean>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return {}; // env hi nahi — sab ON

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .like("key", "sys_edge_%");

  if (error) return cache ?? {}; // fail-open

  const next: Record<string, boolean> = {};
  for (const row of (data ?? []) as { key: string; value: string | null }[]) {
    next[row.key] = parseValue(row.value);
  }
  cache = next;
  cachedAt = Date.now();
  return next;
}

/** Ek function abhi chalu hai? */
export async function isFunctionEnabled(fn: string): Promise<boolean> {
  if (PROTECTED_FUNCTIONS.has(fn)) return true;
  const switches = await loadSwitches();
  const v = switches[switchKey(fn)];
  return v === undefined ? true : v;
}

/**
 * Function ke handler me sabse pehle call karo (CORS preflight ke turant baad):
 *
 *   const off = await guardSwitch("chatbot", corsHeaders);
 *   if (off) return off;
 *
 * Switch ON ho to `null` milta hai aur function normal chalta hai.
 */
export async function guardSwitch(
  fn: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  try {
    if (await isFunctionEnabled(fn)) return null;
  } catch {
    return null; // guard kabhi outage ki wajah nahi banega
  }

  return new Response(
    JSON.stringify({
      error: "feature_disabled",
      message: "Ye suvidha abhi thodi der ke liye band hai. Lecture, PDF aur video chalu hain.",
    }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/** Tests ke liye. */
export function resetSwitchCache(): void {
  cache = null;
  cachedAt = 0;
}
