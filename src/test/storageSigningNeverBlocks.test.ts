import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard (audit 2026-09-20, HIGH).
 *
 * Course lists await resolveContentUrl(s) before painting. On a dying radio the
 * storage signing request can hang forever, which used to leave the list on an
 * endless skeleton. Every storage round-trip here must be time-capped so the
 * caller always gets an answer (null -> placeholder) instead of freezing.
 */

const hang = () => new Promise(() => {});

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        list: hang,
        createSignedUrl: hang,
        createSignedUrls: hang,
      }),
    },
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ insert: async () => ({}) }),
  },
}));

import { resolveContentUrl, resolveContentUrls } from "../lib/resolveContentUrl";

describe("storage signing is time-capped", () => {
  beforeEach(() => vi.useFakeTimers());

  it("resolveContentUrl gives up instead of hanging", async () => {
    const p = resolveContentUrl("storage://content/lessons/a.pdf");
    await vi.advanceTimersByTimeAsync(7000);
    expect(await p).toBeNull();
  });

  it("resolveContentUrls gives up instead of hanging", async () => {
    const p = resolveContentUrls(["storage://content/lessons/a.pdf"]);
    await vi.advanceTimersByTimeAsync(7000);
    expect(await p).toEqual([null]);
  });
});
