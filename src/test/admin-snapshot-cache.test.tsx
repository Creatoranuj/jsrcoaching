import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  ADMIN_SNAPSHOT_KEY,
  ADMIN_SNAPSHOT_STALE_MS,
  EMPTY_ADMIN_SNAPSHOT,
  adminSnapshotQueryOptions,
  patchAdminSnapshot,
} from "@/features/admin/lib/adminSnapshot";
import type { AdminSnapshot } from "@/features/admin/lib/adminSnapshot";
import { shouldSkipKey } from "@/lib/perf/queryPersister";
import { formatRelativeAge } from "@/features/admin/hooks/useRelativeAge";

/** Supabase stub whose every query resolves to an empty, error-free result. */
function stubSupabase(onQuery: () => void) {
  const from = () => {
    onQuery();
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "ilike"]) builder[m] = () => builder;
    const p = Promise.resolve({ data: [], error: null, count: 0 });
    builder.then = p.then.bind(p);
    builder.catch = p.catch.bind(p);
    builder.finally = p.finally.bind(p);
    return builder;
  };
  return { from } as unknown as Parameters<typeof adminSnapshotQueryOptions>[0];
}

describe("admin dashboard snapshot cache", () => {
  it("serves a second read inside the 60 s window from memory (no new queries)", async () => {
    const queries = vi.fn();
    const client = new QueryClient();
    const options = adminSnapshotQueryOptions(stubSupabase(queries));

    await client.fetchQuery(options);
    const afterFirst = queries.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // A remount within staleTime must not hit the network again.
    await client.fetchQuery(options);
    expect(queries.mock.calls.length).toBe(afterFirst);
    expect(ADMIN_SNAPSHOT_STALE_MS).toBe(60_000);
  });

  it("refetchQueries bypasses the fresh window (Refresh button semantics)", async () => {
    const queries = vi.fn();
    const client = new QueryClient();
    const options = adminSnapshotQueryOptions(stubSupabase(queries));
    await client.fetchQuery(options);
    const afterFirst = queries.mock.calls.length;
    await client.refetchQueries({ queryKey: ADMIN_SNAPSHOT_KEY });
    expect(queries.mock.calls.length).toBe(afterFirst * 2);
  });

  it("patchAdminSnapshot updates the cached rows in place", () => {
    const client = new QueryClient();
    client.setQueryData<AdminSnapshot>(ADMIN_SNAPSHOT_KEY, {
      ...EMPTY_ADMIN_SNAPSHOT,
      users: [{ id: "u1", full_name: "Asha", email: "a@x.in", mobile: null, created_at: "2026-01-01", role: "student" }],
    });
    patchAdminSnapshot(client, (s) => ({
      ...s,
      users: s.users.map((u) => (u.id === "u1" ? { ...u, role: "teacher" } : u)),
    }));
    expect(client.getQueryData<AdminSnapshot>(ADMIN_SNAPSHOT_KEY)?.users[0].role).toBe("teacher");
  });

  it("patchAdminSnapshot starts from the empty snapshot when nothing is cached", () => {
    const client = new QueryClient();
    patchAdminSnapshot(client, (s) => ({ ...s, stats: { ...s.stats, activeSessions: 3 } }));
    expect(client.getQueryData<AdminSnapshot>(ADMIN_SNAPSHOT_KEY)?.stats.activeSessions).toBe(3);
  });

  it("is never written to the on-device query persister (PII)", () => {
    expect(shouldSkipKey([...ADMIN_SNAPSHOT_KEY])).toBe(true);
    expect(adminSnapshotQueryOptions(stubSupabase(() => {})).meta).toEqual({ persist: false });
    // Sanity: an unrelated key is still persisted.
    expect(shouldSkipKey(["courses", "list"])).toBe(false);
  });

  it("formats the 'Updated … ago' label", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeAge(0, now)).toBe("");
    expect(formatRelativeAge(now - 2_000, now)).toBe("just now");
    expect(formatRelativeAge(now - 45_000, now)).toBe("45s ago");
    expect(formatRelativeAge(now - 3 * 60_000, now)).toBe("3m ago");
    expect(formatRelativeAge(now - 2 * 3_600_000, now)).toBe("2h ago");
  });
});
