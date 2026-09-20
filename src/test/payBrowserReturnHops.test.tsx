import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Browser-return hop order (regression guard for the 2026-09-20 fix).
 *
 * A student who paid in Chrome got stranded on the WEBSITE and had to log in a
 * second time, because the automatic https hop reused the same tab. The rules
 * this test locks in:
 *   1. `intent://` fires FIRST (Chrome honours it without a gesture).
 *   2. the custom scheme follows as hop 2.
 *   3. the https website link is NEVER automatic — only via a real tap.
 */

vi.mock("@/lib/sentry", () => ({
  addBreadcrumb: vi.fn(),
  reportError: vi.fn(),
}));

const openRazorpayCheckout = vi.fn();
vi.mock("@/utils/razorpay", () => ({
  openRazorpayCheckout: (...args: unknown[]) => openRazorpayCheckout(...args),
  formatRazorpayError: (e: unknown) => String(e),
  buildUpiCheckoutConfig: () => ({}),
  buildRazorpayPrefill: () => ({}),
}));

import PayBrowser from "@/pages/PayBrowser";
import { RETURN_HANDOFF_STEP_MS } from "@/config/paymentReturn";

const QUERY = "/pay?order=order_123&key=rzp_test_x&amount=49900&course=7&title=Test";

let hrefs: string[] = [];
let originalLocation: Location;

beforeEach(() => {
  hrefs = [];
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      get href() { return originalLocation.href; },
      set href(v: string) { hrefs.push(v); },
    },
  });
  openRazorpayCheckout.mockImplementation(async (opts: { handler: () => void }) => {
    opts.handler();
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[QUERY]}>
      <PayBrowser />
    </MemoryRouter>,
  );

describe("PayBrowser return hops", () => {
  it("fires intent:// first and the custom scheme second, never https", async () => {
    renderPage();
    await screen.findByText(/App me wapas jayein/i);

    expect(hrefs[0]?.startsWith("intent://payment-callback")).toBe(true);

    // Hop 2 is scheduled; advance real time just past the handoff step.
    await new Promise((r) => setTimeout(r, RETURN_HANDOFF_STEP_MS + 50));

    expect(hrefs[1]?.startsWith("intent://")).toBe(false);
    expect(hrefs[1]).toContain("://payment-callback");
    expect(hrefs.some((u) => u.startsWith("http"))).toBe(false);
  });

  it("only a real tap on the website link navigates to https", async () => {
    renderPage();
    await screen.findByText(/App me wapas jayein/i);
    hrefs = [];

    fireEvent.click(screen.getByRole("button", { name: /Website par kholein/i }));

    expect(hrefs).toHaveLength(1);
    expect(hrefs[0].startsWith("https://")).toBe(true);
    expect(hrefs[0]).toContain("/payment-callback");
  });
});
