import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeUpiApps, listUpiApps } from "../utils/upiApps";

const loadRazorpayNativeMock = vi.fn();
vi.mock("../lib/native/razorpay", () => ({
  loadRazorpayNative: () => loadRazorpayNativeMock(),
}));

beforeEach(() => {
  loadRazorpayNativeMock.mockReset();
});

describe("normalizeUpiApps", () => {
  it("maps known packages to friendly names and orders them", () => {
    expect(
      normalizeUpiApps({
        apps: [
          { packageName: "net.one97.paytm", label: "Paytm-ish" },
          { packageName: "com.phonepe.app" },
          { packageName: "com.google.android.apps.nbu.paisa.user" },
        ],
      }),
    ).toEqual([
      { packageName: "com.google.android.apps.nbu.paisa.user", label: "Google Pay" },
      { packageName: "com.phonepe.app", label: "PhonePe" },
      { packageName: "net.one97.paytm", label: "Paytm" },
    ]);
  });

  it("drops duplicates and unusable entries", () => {
    expect(
      normalizeUpiApps({
        apps: [
          { packageName: "com.phonepe.app" },
          { packageName: "com.phonepe.app" },
          { packageName: "" },
          { label: "no package" },
          null,
        ],
      }),
    ).toEqual([{ packageName: "com.phonepe.app", label: "PhonePe" }]);
  });

  it("keeps the launcher label for unknown apps", () => {
    expect(normalizeUpiApps({ apps: [{ packageName: "com.bank.x", label: "Bank X UPI" }] })).toEqual([
      { packageName: "com.bank.x", label: "Bank X UPI" },
    ]);
  });

  it("returns an empty list for junk payloads", () => {
    expect(normalizeUpiApps(undefined)).toEqual([]);
    expect(normalizeUpiApps({})).toEqual([]);
    expect(normalizeUpiApps({ apps: "nope" })).toEqual([]);
  });
});

describe("listUpiApps", () => {
  it("never throws when the bridge is missing", async () => {
    loadRazorpayNativeMock.mockRejectedValue(new Error("no bridge"));
    await expect(listUpiApps()).resolves.toEqual([]);
  });

  it("returns an empty list on an older APK without the method", async () => {
    loadRazorpayNativeMock.mockResolvedValue({ open: vi.fn(), cancel: vi.fn() });
    await expect(listUpiApps()).resolves.toEqual([]);
  });

  it("returns the installed apps", async () => {
    loadRazorpayNativeMock.mockResolvedValue({
      open: vi.fn(),
      cancel: vi.fn(),
      getUpiApps: vi.fn().mockResolvedValue({ apps: [{ packageName: "com.phonepe.app" }] }),
    });
    await expect(listUpiApps()).resolves.toEqual([
      { packageName: "com.phonepe.app", label: "PhonePe" },
    ]);
  });
});
