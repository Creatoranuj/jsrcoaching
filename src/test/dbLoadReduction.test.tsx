/**
 * PERF 2026-09-20 — "100 students" load-reduction guards.
 *
 * These lock in the three changes that cut Supabase Disk IO:
 *  1. site_settings is read ONCE for all feature-flag hooks (30 min cache).
 *  2. the session token is persisted, so a relaunch reuses the server-side
 *     session slot instead of inserting a new user_sessions row.
 *  3. the enrollments list is shared across every mounted screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const selectSpy = vi.fn();
const invokeSpy = vi.fn();
const getSessionSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (cols: string) => {
        selectSpy(table, cols);
        const result = Promise.resolve({ data: [], error: null });
        return Object.assign(result, {
          eq: () => Promise.resolve({ data: [], error: null }),
        });
      },
    }),
    functions: { invoke: (...args: unknown[]) => invokeSpy(...args) },
    auth: { getSession: () => getSessionSpy() },
  },
}));

describe("site_settings is read once for every feature-flag hook", () => {
  beforeEach(async () => {
    selectSpy.mockClear();
    const { resetSiteSettingsCache } = await import("@/lib/siteSettingsCache");
    resetSiteSettingsCache();
  });

  it("de-duplicates concurrent reads and then serves from cache", async () => {
    const { loadSiteSettings, loadSiteSettingRows, resetSiteSettingsCache } =
      await import("@/lib/siteSettingsCache");

    await Promise.all([
      loadSiteSettings(),
      loadSiteSettings(),
      loadSiteSettingRows(["menu_reports"]),
    ]);
    expect(selectSpy).toHaveBeenCalledTimes(1);

    await loadSiteSettings();
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Admin toggles a setting → next read goes to the server again.
    resetSiteSettingsCache();
    await loadSiteSettings();
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });
});

describe("session tracking reuses the persisted token", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    invokeSpy.mockResolvedValue({ data: { session_token: "tok-1" }, error: null });
    getSessionSpy.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    window.localStorage.clear();
  });

  afterEach(async () => {
    const { stopSessionTracking } = await import("@/lib/native/sessionTracker");
    await stopSessionTracking();
    invokeSpy.mockReset();
  });

  it("creates one session row, then reuses it after a relaunch", async () => {
    vi.resetModules();
    const first = await import("@/lib/native/sessionTracker");
    await first.startSessionTracking("user-1");

    const creates = invokeSpy.mock.calls.filter(
      ([, opts]) => (opts as { body?: { action?: string } })?.body?.action === "create",
    );
    expect(creates).toHaveLength(1);

    // Simulate an app relaunch: fresh module state, same persistent storage.
    vi.resetModules();
    const second = await import("@/lib/native/sessionTracker");
    await second.startSessionTracking("user-1");

    const createsAfter = invokeSpy.mock.calls.filter(
      ([, opts]) => (opts as { body?: { action?: string } })?.body?.action === "create",
    );
    expect(createsAfter).toHaveLength(1); // no second user_sessions row
  });
});

describe("enrollments list is shared between screens", () => {
  it("one read serves several mounted hooks, and a write invalidates it", async () => {
    vi.resetModules();
    vi.doMock("../contexts/AuthContext", () => ({
      useAuth: () => ({ user: { id: "user-1" } }),
    }));
    vi.doMock("../lib/resolveContentUrl", () => ({
      resolveContentUrls: async (input: unknown[]) => input.map(() => null),
    }));

    selectSpy.mockClear();
    const { useEnrollments, invalidateEnrollmentsCache } = await import("@/hooks/useEnrollments");

    const a = renderHook(() => useEnrollments());
    const b = renderHook(() => useEnrollments());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));

    const reads = selectSpy.mock.calls.filter(([table]) => table === "enrollments");
    expect(reads).toHaveLength(1);

    invalidateEnrollmentsCache();
    const c = renderHook(() => useEnrollments());
    await waitFor(() => expect(c.result.current.loading).toBe(false));
    expect(selectSpy.mock.calls.filter(([table]) => table === "enrollments").length).toBe(2);
  });
});
