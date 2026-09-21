// JSR COACHING — stable APK download link.
//
// Why this exists: every release publishes a new GitHub asset URL, so any link
// baked into an old APK (or pasted into WhatsApp) goes stale. This endpoint is
// the ONE address that never changes:
//
//   https://<project>.supabase.co/functions/v1/app-download
//
// It looks up the link CI published into `app_config.android_store_url`,
// re-validates it against a strict allow-list (our own GitHub release assets
// only), and 302-redirects. Benefits:
//   * the in-app update button never needs a new link,
//   * a bad/typo'd link in the DB can never redirect students off-site,
//   * downloads can be switched off or repointed from one place,
//   * one log line per download gives a rough install counter.
//
// Public on purpose (an APK download must work before/without login), so it
// only ever reads one non-sensitive column and never accepts caller input.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { guardSwitch } from "../_shared/systemSwitch.ts";

/** Fixed-name asset of the newest release — CI always attaches JSRCoaching.apk. */
const LATEST_APK_FALLBACK =
  "https://github.com/Creatoranuj/jsrcoaching/releases/latest/download/JSRCoaching.apk";

/** Only our own release assets may be redirected to. */
const GITHUB_RELEASE_RE =
  /^https:\/\/github\.com\/Creatoranuj\/jsrcoaching\/releases\/(download\/[^/]+\/[^/]+|latest\/download\/[^/]+)$/;

function isAllowed(url: unknown): url is string {
  return typeof url === "string" && GITHUB_RELEASE_RE.test(url.trim());
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Survival Mode: admin ne is function ko band kiya ho to yahin ruk jao.
  const __switchOff = await guardSwitch("app-download", corsHeaders);
  if (__switchOff) return __switchOff;
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let target = LATEST_APK_FALLBACK;
  let version: string | null = null;

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin
      .from("app_config")
      .select("android_store_url,latest_android_version")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    version = (data?.latest_android_version as string | null) ?? null;
    const configured = (data?.android_store_url as string | null) ?? null;
    if (isAllowed(configured)) {
      target = configured.trim();
    } else if (configured) {
      // A Play Store link (or anything else) is a deliberate admin choice for
      // the in-app button, but this endpoint only serves direct APKs.
      console.warn("[app-download] configured url not a release asset, using latest", { configured });
    }
  } catch (e) {
    // Never fail a download because the database hiccuped — the fixed-name
    // "latest release" asset is always a valid answer.
    console.error("[app-download] config read failed, using latest release", e);
  }

  console.log("[app-download] redirect", { target, version });

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: target,
      // Short cache: a new release must take effect within minutes, but a
      // burst of taps after a push notification shouldn't hit the DB each time.
      "Cache-Control": "public, max-age=300",
      "X-App-Version": version ?? "",
    },
  });
});
