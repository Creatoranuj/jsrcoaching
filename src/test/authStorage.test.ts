import { describe, it, expect, beforeEach } from "vitest";
import { hasStoredSupabaseSession } from "../lib/authStorage";

describe("hasStoredSupabaseSession", () => {
  beforeEach(() => localStorage.clear());

  it("is false with no supabase token", () => {
    localStorage.setItem("theme", "dark");
    expect(hasStoredSupabaseSession()).toBe(false);
  });

  it("is true when a sb-<ref>-auth-token is persisted", () => {
    localStorage.setItem("sb-wegamscqtvqhxowlskfm-auth-token", JSON.stringify({ access_token: "x" }));
    expect(hasStoredSupabaseSession()).toBe(true);
  });

  it("ignores an emptied token slot", () => {
    localStorage.setItem("sb-wegamscqtvqhxowlskfm-auth-token", "null");
    expect(hasStoredSupabaseSession()).toBe(false);
  });
});
