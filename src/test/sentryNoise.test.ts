import { describe, expect, it } from "vitest";
import { HANDLED_NOISE_RE, isNoiseMessage } from "../lib/sentry";

// Regression for Sentry issue 7634304049 (SAFAR-ENGLISH-W): an un-enrolled
// tap on a locked PDF made pdf.js raise `ResponseException: Unexpected server
// response (403)` which reached Sentry as a warning issue. FastPdfReader
// skips captureException for 403/404; HANDLED_NOISE_RE is the transport-layer
// backstop so no future call path can re-open the issue.
describe("sentry noise filter — pdf-proxy 403/404", () => {
  it("drops pdf.js ResponseException 403 from pdf-proxy", () => {
    const msg =
      'ResponseException: Unexpected server response (403) while retrieving PDF "https://example.supabase.co/functions/v1/pdf-proxy?kind=url&url=...".';
    expect(isNoiseMessage(msg)).toBe(true);
    expect(HANDLED_NOISE_RE.test(msg)).toBe(true);
  });

  it("drops stale-link 404 responses", () => {
    expect(isNoiseMessage("Unexpected server response (404) while retrieving PDF")).toBe(true);
  });

  it("keeps 5xx proxy failures — those are real outages", () => {
    expect(HANDLED_NOISE_RE.test("Unexpected server response (500) while retrieving PDF")).toBe(false);
    expect(HANDLED_NOISE_RE.test("Unexpected server response (502) while retrieving PDF")).toBe(false);
  });

  it("keeps ordinary app errors reportable", () => {
    expect(isNoiseMessage("TypeError: Cannot read properties of undefined")).toBe(false);
  });
});
