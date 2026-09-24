import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LOGIN_TIMEOUT_MS,
  LoginTimeoutError,
  isRetryableAuthError,
  withLoginTimeout,
} from "@/lib/loginErrors";

describe("isRetryableAuthError — waking Auth service vs real failures", () => {
  it("treats gotrue's 5xx AuthRetryableFetchError (message '{}') as retryable", () => {
    expect(
      isRetryableAuthError({ name: "AuthRetryableFetchError", message: "{}", status: 504 }),
    ).toBe(true);
    expect(isRetryableAuthError({ name: "AuthApiError", message: "{}", status: 503 })).toBe(true);
    expect(isRetryableAuthError({ message: "{}" })).toBe(true);
  });

  it("recognises gateway wording without a status", () => {
    expect(isRetryableAuthError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetryableAuthError(new Error("Service Unavailable"))).toBe(true);
    expect(isRetryableAuthError(new Error("upstream request timeout"))).toBe(true);
  });

  it("does NOT reclassify wrong credentials, rate limits or offline", () => {
    expect(
      isRetryableAuthError({ name: "AuthApiError", message: "Invalid login credentials", status: 400 }),
    ).toBe(false);
    expect(isRetryableAuthError({ message: "Too many requests", status: 429 })).toBe(false);
    // status 0 = fetch never reached the server → existing network copy applies
    expect(
      isRetryableAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }),
    ).toBe(false);
    expect(isRetryableAuthError(null)).toBe(false);
    expect(isRetryableAuthError("nope")).toBe(false);
  });
});

describe("withLoginTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the attempt's own result when it settles in time", async () => {
    vi.useFakeTimers();
    const result = withLoginTimeout(Promise.resolve({ error: null }), 1000);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ error: null });
  });

  it("resolves with a LoginTimeoutError once the deadline passes", async () => {
    vi.useFakeTimers();
    const never = new Promise<{ error: null }>(() => {});
    const result = withLoginTimeout(never, LOGIN_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS + 1);
    const settled = await result;
    expect(settled.error).toBeInstanceOf(LoginTimeoutError);
    expect(settled.error?.name).toBe("LoginTimeoutError");
  });

  it("defaults to a 25 second deadline", () => {
    expect(LOGIN_TIMEOUT_MS).toBe(25_000);
  });
});
