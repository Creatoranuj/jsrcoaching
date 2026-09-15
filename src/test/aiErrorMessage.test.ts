import { describe, it, expect } from "vitest";
import { friendlyAiError, isAiKeyFailure, AI_ERROR_COPY } from "../lib/aiErrorMessage";

describe("friendlyAiError", () => {
  it("does NOT blame the server key for a gateway timeout", () => {
    expect(friendlyAiError({ code: "gateway_timeout", status: 504 })).toBe(AI_ERROR_COPY.SLOW);
    expect(friendlyAiError({ message: "gateway_timeout" })).toBe(AI_ERROR_COPY.SLOW);
  });

  it("does NOT blame the server key for a transient upstream 5xx", () => {
    expect(friendlyAiError({ code: "gateway_502", status: 502 })).toBe(AI_ERROR_COPY.SERVER);
  });

  it("blames the key only for real credential failures", () => {
    expect(friendlyAiError({ code: "gateway_unauthorized", status: 503 })).toBe(AI_ERROR_COPY.KEY_ISSUE);
    expect(friendlyAiError({ code: "not_configured", status: 503 })).toBe(AI_ERROR_COPY.KEY_ISSUE);
    expect(friendlyAiError({ message: "lovable_api_key_not_registered" })).toBe(AI_ERROR_COPY.KEY_ISSUE);
    expect(isAiKeyFailure({ code: "gateway_timeout" })).toBe(false);
  });

  it("maps rate limit, credits and session expiry", () => {
    expect(friendlyAiError({ status: 429 })).toBe(AI_ERROR_COPY.RATE);
    expect(friendlyAiError({ code: "credits_exhausted", status: 402 })).toBe(AI_ERROR_COPY.CREDITS);
    expect(friendlyAiError({ status: 401 })).toBe(AI_ERROR_COPY.SESSION);
  });

  it("reports offline instead of a server fault when the fetch never left the device", () => {
    expect(friendlyAiError({ message: "Failed to fetch" })).toBe(AI_ERROR_COPY.OFFLINE);
  });

  it("falls back to a neutral connection message", () => {
    expect(friendlyAiError({})).toBe(AI_ERROR_COPY.GENERIC);
  });
});
