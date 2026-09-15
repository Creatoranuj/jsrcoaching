import { test, expect } from "@playwright/test";

/**
 * Regression guard for docs/AUDIT-2026-07-15.md — HIGH #18.
 *
 * A signed-in non-admin user must NOT be able to SELECT other users' rows
 * from public.profiles (email + mobile enumeration). The base table SELECT
 * policy is scoped to owner + admin + teacher; the profiles_public view is
 * the only fan-out path for public columns (id, full_name, avatar_url).
 *
 * Env:
 *   E2E_SUPABASE_URL        - Supabase project URL
 *   E2E_SUPABASE_ANON_KEY   - anon publishable key
 *   E2E_STUDENT_EMAIL       - a non-admin, non-teacher test account
 *   E2E_STUDENT_PASSWORD
 */
test.describe("profiles RLS - PII enumeration", () => {
  test("non-admin user cannot read other profiles' email/mobile", async ({ request }) => {
    const url = process.env.E2E_SUPABASE_URL;
    const anon = process.env.E2E_SUPABASE_ANON_KEY;
    const email = process.env.E2E_STUDENT_EMAIL;
    const password = process.env.E2E_STUDENT_PASSWORD;
    test.skip(!url || !anon || !email || !password, "supabase e2e credentials not configured");

    // Sign in.
    const signin = await request.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: anon!, "Content-Type": "application/json" },
      data: { email, password },
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const { access_token, user } = await signin.json();
    expect(access_token).toBeTruthy();
    expect(user?.id).toBeTruthy();

    // Attempt to enumerate.
    const res = await request.get(
      `${url}/rest/v1/profiles?select=id,email,mobile&limit=1000`,
      {
        headers: {
          apikey: anon!,
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ id: string; email: string | null; mobile: string | null }> =
      await res.json();

    // Post-fix expectation: only the caller's own row is visible.
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const row of rows) {
      expect(row.id).toBe(user.id);
    }
  });
});
