/**
 * Receipts bucket RLS regression.
 *
 * Guards the fix for security finding `receipts_insert_missing_folder_ownership`.
 * The INSERT policy on `storage.objects` for bucket `receipts` must require
 * `(storage.foldername(name))[1] = auth.uid()::text`, so an authenticated
 * user cannot write into another user's receipt folder.
 *
 * Requires env: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY,
 *               E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD.
 * Skipped locally if any are missing.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.E2E_TEST_USER_EMAIL;
const PASSWORD = process.env.E2E_TEST_USER_PASSWORD;

test.describe("storage: receipts bucket folder ownership", () => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD to run.",
  );

  test("rejects upload into another user's folder", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    expect(authError, `sign-in failed: ${authError?.message}`).toBeNull();
    expect(authData.user?.id).toBeTruthy();

    // Deterministic "other" uuid distinct from the signed-in user.
    const otherUserId = "00000000-0000-0000-0000-000000000001";
    expect(otherUserId).not.toBe(authData.user!.id);

    const path = `${otherUserId}/e2e-${Date.now()}.png`;
    const body = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

    const { data, error } = await supabase.storage.from("receipts").upload(path, body, {
      contentType: "image/png",
      upsert: false,
    });

    // Must be blocked by RLS. Supabase surfaces this as an error with a 4xx status.
    expect(data, "upload into another user's folder should be rejected").toBeNull();
    expect(error, "RLS must reject cross-folder upload").not.toBeNull();
    const message = (error?.message ?? "").toLowerCase();
    const status = (error as { status?: number } | null)?.status;
    expect(
      status === 403 ||
        status === 401 ||
        status === 400 ||
        message.includes("row-level security") ||
        message.includes("unauthorized") ||
        message.includes("policy"),
      `unexpected error shape: status=${status} message=${error?.message}`,
    ).toBe(true);

    await supabase.auth.signOut();
  });

  test("allows upload into caller's own folder", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    expect(authError).toBeNull();
    const uid = authData.user!.id;

    const path = `${uid}/e2e-${Date.now()}.png`;
    const body = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const { error } = await supabase.storage.from("receipts").upload(path, body, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error, `own-folder upload should succeed: ${error?.message}`).toBeNull();

    await supabase.storage.from("receipts").remove([path]);
    await supabase.auth.signOut();
  });
});