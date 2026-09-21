import { describe, it, expect } from "vitest";
import {
  sameUser,
  sameProfile,
  keepIfSameUser,
  keepIfSameProfile,
  keepIfSameRole,
} from "@/lib/authIdentity";
import type { User, UserProfile } from "@/contexts/AuthContext";

const user = (over: Partial<User> = {}): User => ({
  id: "u1",
  email: "a@b.com",
  fullName: "A B",
  role: "student",
  ...over,
} as User);

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: "u1",
  email: "a@b.com",
  fullName: "A B",
  avatarUrl: null,
  mobile: "9999999999",
  ...over,
} as UserProfile);

describe("authIdentity", () => {
  it("keeps the previous user object when nothing changed", () => {
    // A TOKEN_REFRESHED event re-derives an equal object. Returning the SAME
    // reference is what stops every useEffect([user]) from re-running and
    // cancelling in-flight work (the payment-return spinner bug).
    const prev = user();
    expect(keepIfSameUser(user())(prev)).toBe(prev);
  });

  it("swaps in the new user object when a field really changed", () => {
    const prev = user();
    const next = user({ fullName: "Changed" });
    expect(keepIfSameUser(next)(prev)).toBe(next);
  });

  it("treats a different account as a different user", () => {
    expect(sameUser(user(), user({ id: "u2" }))).toBe(false);
  });

  it("handles sign-out and sign-in transitions", () => {
    expect(keepIfSameUser(null)(user())).toBeNull();
    const next = user();
    expect(keepIfSameUser(next)(null)).toBe(next);
    expect(sameUser(null, null)).toBe(true);
  });

  it("keeps the previous profile object when nothing changed", () => {
    const prev = profile();
    expect(keepIfSameProfile(profile())(prev)).toBe(prev);
    const next = profile({ mobile: "8888888888" });
    expect(keepIfSameProfile(next)(prev)).toBe(next);
    expect(sameProfile(profile(), profile({ avatarUrl: "x" }))).toBe(false);
  });

  it("keeps the previous role value when unchanged", () => {
    expect(keepIfSameRole("admin")("admin")).toBe("admin");
    expect(keepIfSameRole("admin")("student")).toBe("admin");
    expect(keepIfSameRole(null)("admin")).toBeNull();
  });
});
