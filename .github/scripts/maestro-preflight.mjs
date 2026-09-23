#!/usr/bin/env node
/**
 * Maestro credential preflight.
 *
 * Run #89 (2026-09-23) got all the way to the login screen, typed the stored
 * account and was told "Invalid email or password." — the emulator, WebView
 * devtools and flow tokens were finally right, and a stale password secret
 * still burned a 10-minute run. This script tries every candidate secret
 * pair against the same Supabase password grant the app uses and exports the
 * FIRST pair that actually signs in as MAESTRO_EMAIL / MAESTRO_PASSWORD via
 * $GITHUB_ENV (values masked). No pair working is a clear, early failure
 * that names the secrets to refresh instead of a screenshot of a red banner.
 *
 * Candidate order (first match wins):
 *   1. MAESTRO_EMAIL / MAESTRO_PASSWORD   — dedicated Android account, if set
 *   2. E2E_EMAIL / E2E_PASSWORD           — the pair playwright-e2e verifies
 *   3. TEST_USER_EMAIL / TEST_USER_PASSWORD
 *
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY).
 * Each attempt is one POST; a 429 aborts (the run would fail anyway).
 */
import { appendFileSync } from "node:fs";

const url = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const apiKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

if (!url || !apiKey) {
  console.error("::error::maestro-preflight: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY secrets are missing.");
  process.exit(1);
}

const candidates = [
  ["MAESTRO_EMAIL", "MAESTRO_PASSWORD"],
  ["E2E_EMAIL", "E2E_PASSWORD"],
  ["TEST_USER_EMAIL", "TEST_USER_PASSWORD"],
]
  .map(([e, p]) => ({ label: `${e}/${p}`, email: (process.env[e] ?? "").trim(), password: process.env[p] ?? "" }))
  .filter((c) => c.email && c.password);

if (candidates.length === 0) {
  console.error("::error::maestro-preflight: no credential pair set (MAESTRO_*, E2E_* or TEST_USER_*).");
  process.exit(1);
}

const mask = (v) => v && console.log(`::add-mask::${v}`);
const redact = (email) => email.replace(/^(.).*(@.*)$/, "$1***$2");

async function signIn({ email, password }) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, ok: res.ok && Boolean(body.access_token), body };
}

const tried = [];
for (const c of candidates) {
  const r = await signIn(c);
  tried.push(`${c.label} (${redact(c.email)}) → ${r.status}`);
  if (r.ok) {
    mask(c.password);
    // Sign out the probe session so the flow's own sign-in is the only live one.
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: apiKey, Authorization: `Bearer ${r.body.access_token}` },
    }).catch(() => {});
    if (process.env.GITHUB_ENV) {
      appendFileSync(process.env.GITHUB_ENV, `MAESTRO_EMAIL=${c.email}\nMAESTRO_PASSWORD=${c.password}\n`);
    }
    console.log(`✅ maestro-preflight: using ${c.label} (${redact(c.email)}) — sign-in verified.`);
    process.exit(0);
  }
  if (r.status === 429) {
    console.error(`::error::maestro-preflight: Supabase auth rate limit hit while probing ${c.label}. Re-run in a few minutes.`);
    process.exit(1);
  }
  const reason = r.body?.error_description ?? r.body?.msg ?? r.body?.error ?? "";
  console.log(`✗ ${c.label} (${redact(c.email)}) rejected: ${r.status} ${String(reason).slice(0, 80)}`);
}

console.error(`::error::maestro-preflight: none of the stored logins work — ${tried.join("; ")}. Refresh the password secret for the account the Android smoke should use.`);
process.exit(1);
