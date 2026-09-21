/**
 * Identity-stable auth state.
 *
 * AuthContext re-derives `user` / `profile` on every Supabase auth event —
 * INITIAL_SESSION, the default→enriched cold-start pass, and TOKEN_REFRESHED
 * (~hourly and on every app foreground). Each pass used to `setUser(newObject)`
 * even when nothing changed, so every `useEffect(..., [user])` in the app
 * re-ran and every cleanup fired. On the payment-return screen that cleanup
 * cancelled the enrollment waiter mid-flight (recording 2026-09-21 13:08).
 *
 * These helpers return the PREVIOUS object when the next one is value-equal,
 * so React sees no change and effects keyed on the object stay put. Pure and
 * synchronous — exercised directly by `src/test/authIdentity.test.ts`.
 */
import type { AppRole, User, UserProfile } from "@/contexts/AuthContext";

export const sameUser = (a: User | null, b: User | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id
    && a.email === b.email
    && a.fullName === b.fullName
    && a.role === b.role;
};

export const sameProfile = (a: UserProfile | null, b: UserProfile | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id
    && a.email === b.email
    && a.fullName === b.fullName
    && a.avatarUrl === b.avatarUrl
    && a.mobile === b.mobile;
};

/** `setState` updater: keep the previous object when the next is value-equal. */
export const keepIfSameUser = (next: User | null) => (prev: User | null): User | null =>
  sameUser(prev, next) ? prev : next;

export const keepIfSameProfile = (next: UserProfile | null) => (prev: UserProfile | null): UserProfile | null =>
  sameProfile(prev, next) ? prev : next;

export const keepIfSameRole = (next: AppRole | null) => (prev: AppRole | null): AppRole | null =>
  prev === next ? prev : next;
