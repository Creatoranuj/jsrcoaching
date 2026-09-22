import { describe, expect, it } from "vitest";
import { describeError, toError } from "@/lib/sentry";

/**
 * Audit 2026-09-22 — Sentry issue "Object captured as exception with keys:
 * code, details, hint, message" came from Supabase rejecting with plain
 * objects. `toError` must turn every thrown shape into a real Error that
 * groups sensibly and keeps the original payload reachable.
 */
describe("toError", () => {
  it("returns Error instances untouched", () => {
    const original = new TypeError("boom");
    expect(toError(original)).toBe(original);
  });

  it("wraps a PostgrestError-shaped object into a SupabaseError with cause", () => {
    const pg = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "smart_notes_user_lesson_uniq"',
      details: "Key (user_id, lesson_id)=(u1, l1) already exists.",
      hint: null,
    };
    const err = toError(pg);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SupabaseError");
    expect(err.message).toContain("smart_notes_user_lesson_uniq");
    expect((err as Error & { cause?: unknown }).cause).toBe(pg);
  });

  it("wraps strings", () => {
    const err = toError("AI gateway authentication failed.");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("AI gateway authentication failed.");
  });

  it("wraps message-less objects without throwing", () => {
    const err = toError({ status: 500 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NonErrorThrown");
    expect(err.message).toContain("500");
  });

  it("handles null and undefined", () => {
    expect(toError(null)).toBeInstanceOf(Error);
    expect(toError(undefined)).toBeInstanceOf(Error);
  });
});

describe("describeError", () => {
  it("includes details and hint for Supabase errors", () => {
    const text = describeError({
      code: "42501",
      message: "permission denied for table smart_notes",
      details: null,
      hint: "Check the RLS policy",
    });
    expect(text).toBe("42501 — permission denied for table smart_notes — Check the RLS policy");
  });

  it("keeps the Error name for real errors", () => {
    expect(describeError(new RangeError("x"))).toBe("RangeError: x");
  });
});
