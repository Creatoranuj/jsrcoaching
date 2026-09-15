import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

/** Disposable domain patterns — server-side enforcement */
const BLOCKED_PATTERNS = [
  "tempmail", "throwaway", "disposable", "guerrilla", "fakeinbox",
  "trashmail", "spambox", "junkmail", "burnermail", "minutemail",
  "wegwerf", "mailtemp", "tmpmail", "tempinbox", "maildrop",
  "mailnator", "yopmail", "sharklaser", "spamfree", "nospam",
  "mailinator", "getairmail", "spam4", "10minute", "20minute",
  "tempmailo", "tempemail", "mailcatch", "inboxkitten",
];

const BLOCKED_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "guerrillamail.com", "yopmail.com",
  "throwaway.email", "fakeinbox.com", "sharklasers.com", "grr.la",
  "dispostable.com", "trashmail.com", "trashmail.me", "10minutemail.com",
  "tempail.com", "burnermail.io", "discard.email", "mailnesia.com",
  "maildrop.cc", "getairmail.com", "mohmal.com", "getnada.com",
  "temp-mail.org", "emailondeck.com", "mintemail.com", "tempinbox.com",
  "mailcatch.com", "inboxkitten.com", "tempr.email", "throwawaymail.com",
  "mailforspam.com", "spam4.me", "trashymail.com", "mytemp.email",
  "tempmailo.com", "emailfake.com", "guerrillamail.info",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
  "guerrillamail.biz", "mailtemp.org", "tempmail.plus", "tempmail.ninja",
  "tempmail.dev", "temp-mail.io", "temp-mail.de", "temp-mail.ru",
  "guerrillamailblock.com", "guerrillamail.us",
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  for (const pattern of BLOCKED_PATTERNS) {
    if (domain.includes(pattern)) return true;
  }
  return false;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ blocked: true, reason: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blocked = isDisposableEmail(email);

    return new Response(JSON.stringify({ blocked, reason: blocked ? "Disposable email not allowed" : null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ blocked: false, error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
