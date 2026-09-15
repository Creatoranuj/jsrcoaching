// Send SMS OTP via MSG91 for phone-based login.
//
// Flow:
//   1. Validate phone (Indian 10-digit format).
//   2. Rate-limit: max 3 sends per phone per 15 minutes (Postgres-backed).
//   3. Generate 6-digit code, hash it (SHA-256), store hash + expiry.
//   4. Send SMS via MSG91 OTP API.
//   5. Never log the raw OTP.
//
// Secrets required:
//   MSG91_AUTH_KEY        — dashboard → API → Auth Key
//   MSG91_TEMPLATE_ID     — dashboard → OTP → Template ID (24-char hex)
//   MSG91_SENDER_ID       — 6-char DLT-approved header (e.g. NAVBHT)

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const RATE_LIMIT_WINDOW = 900;  // 15 minutes
const RATE_LIMIT_MAX = 3;

function normalizePhone(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  // Accept: 10-digit (91XXXXXXXXXX -> strip 91), 91XXXXXXXXXX, +91XXXXXXXXXX
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone } = await req.json().catch(() => ({}));
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return new Response(JSON.stringify({ error: "Invalid Indian mobile number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY");
    const TEMPLATE_ID = Deno.env.get("MSG91_TEMPLATE_ID");
    const SENDER_ID = Deno.env.get("MSG91_SENDER_ID");
    if (!AUTH_KEY || !TEMPLATE_ID || !SENDER_ID) {
      console.error("MSG91 secrets missing");
      return new Response(JSON.stringify({ error: "SMS service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit by phone (attackers can rotate anon JWTs; phone is the real key).
    // Reuse existing check_rate_limit — its `_user_id` accepts any UUID-shaped
    // discriminator; we synthesize one from the phone number.
    const phoneKey = "00000000-0000-0000-0000-" + normalized.padStart(12, "0");
    const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
      _bucket: "send-phone-otp",
      _user_id: phoneKey,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Too many OTP requests. Wait 15 minutes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate 6-digit OTP (crypto-random, uniform).
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const otp = String(buf[0] % 1000000).padStart(6, "0");
    const otpHash = await sha256Hex(otp);

    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const { error: insertErr } = await supabaseAdmin.from("phone_otps").insert({
      phone: normalized,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000).toISOString(),
      ip_address: sourceIp,
    });
    if (insertErr) {
      console.error("Failed to store OTP:", insertErr.message);
      return new Response(JSON.stringify({ error: "Could not initiate OTP" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MSG91 OTP API — https://docs.msg91.com/reference/send-otp
    const msg91Res = await fetch(
      `https://control.msg91.com/api/v5/otp?template_id=${TEMPLATE_ID}&mobile=${normalized}&otp=${otp}&sender=${SENDER_ID}&otp_length=6&otp_expiry=5`,
      {
        method: "POST",
        headers: {
          "authkey": AUTH_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    if (!msg91Res.ok) {
      const txt = await msg91Res.text();
      console.error("MSG91 send failed:", msg91Res.status, txt.slice(0, 300));
      return new Response(JSON.stringify({ error: "SMS delivery failed. Try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Never return the OTP. Client just needs to know it was sent.
    return new Response(JSON.stringify({ success: true, phone: normalized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-phone-otp error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
