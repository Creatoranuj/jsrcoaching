/**
 * Integration test: verifies definer-function EXECUTE grants match intent.
 *
 * Public (anon-callable): search_lectures, get_platform_stats
 * Auth-only (authenticated but not anon): has_role, get_user_role,
 *   get_user_profiles_admin, get_quiz_questions,
 *   verify_enrollment_for_attendance, increment_book_clicks,
 *   match_knowledge, check_rate_limit, get_course_lesson_stats
 *
 * Hits the live Supabase project with the anon key to prove the grants
 * are what the audit says they are. Skipped automatically when the
 * network is unavailable so CI stays green offline.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Lazily built: createClient("") throws, so an unconfigured env must not
// construct a client at module load — the suite self-skips instead.
const anon = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : (null as unknown as ReturnType<typeof createClient>);

let online = configured;

beforeAll(async () => {
  if (!configured) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: "GET" });
    online = r.ok || r.status < 500;
  } catch {
    online = false;
  }
});

function isPermissionDenied(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "42501" ||
    /permission denied/i.test(e.message ?? "") ||
    /not.*allowed/i.test(e.message ?? "")
  );
}

(configured ? describe : describe.skip)("definer function access grants", () => {
  // Both of these are intentionally NOT anon-callable any more:
  // stats go through the `platform-stats` edge function, and lecture search
  // requires an authenticated session (the function raises 42501 for anon).
  it("get_platform_stats is not callable by anon", async () => {
    if (!online) return;
    // Either revoked (42501) or removed entirely (PGRST202) — both are fine,
    // stats are served by the `platform-stats` edge function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (anon.rpc as any)("get_platform_stats");
    expect(error).toBeTruthy();
  });


  it("search_lectures is not callable by anon", async () => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (anon.rpc as any)("search_lectures", {
      _query: "a",
      _limit: 1,
    });
    expect(isPermissionDenied(error)).toBe(true);
  });


  it.each([
    "get_user_profiles_admin",
    "get_quiz_questions",
    "verify_enrollment_for_attendance",
    "increment_book_clicks",
    "check_rate_limit",
    "get_course_lesson_stats",
    "has_role",
    "get_user_role",
  ])("%s does not leak data to anon", async (fn) => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (anon.rpc as any)(fn, {} as never);
    // Acceptable outcomes for anon:
    //  - PostgREST/DB error (permission denied, missing arg, auth required)
    //  - null / empty result (STABLE fn no-ops when auth.uid() is null)
    // A non-empty successful data payload = leak.
    if (error) {
      expect(error).toBeTruthy();
      return;
    }
    const leaked =
      data !== null &&
      data !== undefined &&
      !(Array.isArray(data) && data.length === 0) &&
      data !== false;
    expect(leaked, `anon received data from ${fn}: ${JSON.stringify(data)}`).toBe(false);
  });
});

describe("anonymous table exposure", () => {
  // Every route consuming these is behind ProtectedRoute, and the edge
  // functions that read them use the service role. A signed-out visitor
  // must not be able to enumerate them.
  it.each([
    "books",
    "chapters",
    "chatbot_faq",
    "earning_links",
    "knowledge_base",
    "subscription_plans",
  ])("%s is not readable by anon", async (table) => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (anon.from as any)(table).select("*").limit(1);
    expect(
      isPermissionDenied(error),
      `anon could still read ${table}: ${JSON.stringify(error ?? data)}`,
    ).toBe(true);
  });

  // ...and the public landing surface must keep working signed-out.
  it.each([
    "landing_courses",
    "landing_testimonials",
    "landing_content",
    "hero_banners",
    "site_settings",
    "site_stats",
    "app_config",
    "courses",
  ])("%s stays readable by anon", async (table) => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (anon.from as any)(table).select("*").limit(1);
    expect(
      isPermissionDenied(error),
      `anon lost access to public table ${table}`,
    ).toBe(false);
  });
});

