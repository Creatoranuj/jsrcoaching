/**
 * Settlement engine — the one path from "sheet said success" to "student is on
 * My Courses". Fast, server-verified, duplicate-proof.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const invokePaymentFunction = vi.fn();
const recoverEnrollment = vi.fn();
const markEnrollmentChanged = vi.fn();
const clearPendingPayment = vi.fn();

vi.mock("@/utils/paymentApi", () => {
  class PaymentApiError extends Error {
    status?: number;
    code?: string;
    constructor(message: string, opts?: { status?: number; code?: string }) {
      super(message);
      this.name = "PaymentApiError";
      this.status = opts?.status;
      this.code = opts?.code;
    }
  }
  return {
    invokePaymentFunction: (...a: unknown[]) => invokePaymentFunction(...a),
    recoverEnrollment: (...a: unknown[]) => recoverEnrollment(...a),
    PaymentApiError,
  };
});
vi.mock("@/lib/enrollmentFreshness", () => ({
  markEnrollmentChanged: (...a: unknown[]) => markEnrollmentChanged(...a),
}));
vi.mock("@/lib/pendingPayment", () => ({
  clearPendingPayment: (...a: unknown[]) => clearPendingPayment(...a),
}));

const response = {
  razorpay_order_id: "order_A1",
  razorpay_payment_id: "pay_A1",
  razorpay_signature: "sig",
};

const load = async () => {
  vi.resetModules();
  const api = await import("@/utils/paymentApi");
  const engine = await import("@/lib/paymentEngine");
  return { ...engine, PaymentApiError: api.PaymentApiError };
};

describe("settlePayment", () => {
  beforeEach(() => {
    invokePaymentFunction.mockReset();
    recoverEnrollment.mockReset();
    markEnrollmentChanged.mockReset();
    clearPendingPayment.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verify OK → enrolled, caches dropped, device reminder cleared", async () => {
    const { settlePayment } = await load();
    invokePaymentFunction.mockResolvedValueOnce({ ok: true });

    const result = await settlePayment({ courseId: 7, userId: "u1", response });

    expect(result.outcome).toBe("enrolled");
    expect(invokePaymentFunction).toHaveBeenCalledTimes(1);
    expect(invokePaymentFunction).toHaveBeenCalledWith(
      "verify-razorpay-payment",
      expect.objectContaining({
        razorpay_order_id: "order_A1",
        razorpay_payment_id: "pay_A1",
        razorpay_signature: "sig",
        course_id: 7,
      }),
    );
    expect(markEnrollmentChanged).toHaveBeenCalledWith(7, "u1");
    expect(clearPendingPayment).toHaveBeenCalledTimes(1);
    expect(recoverEnrollment).not.toHaveBeenCalled();
  });

  it("duplicate calls for the same order share ONE verify (single-flight)", async () => {
    const { settlePayment } = await load();
    let release: (v: unknown) => void = () => {};
    invokePaymentFunction.mockReturnValueOnce(new Promise((r) => { release = r; }));

    const a = settlePayment({ courseId: 7, userId: "u1", response });
    const b = settlePayment({ courseId: 7, userId: "u1", response });
    expect(a).toBe(b);

    release({ ok: true });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.outcome).toBe("enrolled");
    expect(rb.outcome).toBe("enrolled");
    expect(invokePaymentFunction).toHaveBeenCalledTimes(1);

    // Once settled, a fresh call is allowed again (server is idempotent).
    invokePaymentFunction.mockResolvedValueOnce({ ok: true });
    await settlePayment({ courseId: 7, userId: "u1", response });
    expect(invokePaymentFunction).toHaveBeenCalledTimes(2);
  });

  it("verify TIMEOUT but reconcile finds the enrollment → enrolled", async () => {
    const { settlePayment, PaymentApiError } = await load();
    invokePaymentFunction.mockRejectedValueOnce(new PaymentApiError("timed out", { code: "TIMEOUT" }));
    recoverEnrollment.mockResolvedValueOnce("recovered");

    const result = await settlePayment({ courseId: 7, userId: "u1", response });

    expect(result.outcome).toBe("enrolled");
    expect(recoverEnrollment).toHaveBeenCalledTimes(1);
    expect(markEnrollmentChanged).toHaveBeenCalledWith(7, "u1");
    expect(clearPendingPayment).toHaveBeenCalledTimes(1);
  });

  it("verify 503 and webhook not landed yet → pending (never 'failed', reminder kept)", async () => {
    vi.useFakeTimers();
    const { settlePayment, PaymentApiError } = await load();
    invokePaymentFunction.mockRejectedValueOnce(new PaymentApiError("busy", { status: 503 }));
    recoverEnrollment.mockResolvedValue("not-yet");

    const p = settlePayment({ courseId: 7, userId: "u1", response });
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await p;

    expect(result.outcome).toBe("pending");
    // Exactly two bounded reconcile calls — the syncing gate takes over next.
    expect(recoverEnrollment).toHaveBeenCalledTimes(2);
    expect(markEnrollmentChanged).not.toHaveBeenCalled();
    expect(clearPendingPayment).not.toHaveBeenCalled();
  });

  it("hard 4xx (bad signature / refunded) → failed with webhook reassurance, no reconcile", async () => {
    const { settlePayment, PaymentApiError } = await load();
    invokePaymentFunction.mockRejectedValueOnce(
      new PaymentApiError("Invalid signature", { status: 400, code: "BAD_SIGNATURE" }),
    );

    const result = await settlePayment({ courseId: 7, userId: "u1", response });

    expect(result.outcome).toBe("failed");
    expect(result.reason).toContain("Invalid signature");
    expect(result.reason).toContain("webhook");
    expect(recoverEnrollment).not.toHaveBeenCalled();
    expect(markEnrollmentChanged).not.toHaveBeenCalled();
  });
});

describe("dismissSafetyCheck", () => {
  beforeEach(() => {
    recoverEnrollment.mockReset();
    markEnrollmentChanged.mockReset();
    clearPendingPayment.mockReset();
  });

  it("payment actually landed → true, caches dropped, reminder cleared", async () => {
    const { dismissSafetyCheck } = await load();
    recoverEnrollment.mockResolvedValueOnce("recovered");
    await expect(dismissSafetyCheck(7, "u1")).resolves.toBe(true);
    expect(markEnrollmentChanged).toHaveBeenCalledWith(7, "u1");
    expect(clearPendingPayment).toHaveBeenCalledTimes(1);
  });

  it("genuine cancel → false and the device reminder is cleared (no false resume toast)", async () => {
    const { dismissSafetyCheck } = await load();
    recoverEnrollment.mockResolvedValueOnce("not-yet");
    await expect(dismissSafetyCheck(7, "u1")).resolves.toBe(false);
    expect(clearPendingPayment).toHaveBeenCalledTimes(1);
    expect(markEnrollmentChanged).not.toHaveBeenCalled();
  });

  it("network hiccup → false but the reminder is KEPT so resume can retry", async () => {
    const { dismissSafetyCheck } = await load();
    recoverEnrollment.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(dismissSafetyCheck(7, "u1")).resolves.toBe(false);
    expect(clearPendingPayment).not.toHaveBeenCalled();
  });

  it("makes exactly ONE server call (rate budget)", async () => {
    const { dismissSafetyCheck } = await load();
    recoverEnrollment.mockResolvedValueOnce("not-yet");
    await dismissSafetyCheck(7, "u1");
    expect(recoverEnrollment).toHaveBeenCalledTimes(1);
  });
});

describe("BuyCourse wiring (source-level regression guards)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const buyCourse = read("src/pages/BuyCourse.tsx");

  it("routes every sheet success through the settlement engine", () => {
    expect(buyCourse).toContain("settlePayment(");
    expect(buyCourse).not.toMatch(/invokePaymentFunction\(\s*"verify-razorpay-payment"/);
  });

  it("redirects immediately — no delayed redirect timer left behind", () => {
    expect(buyCourse).not.toContain("redirectTimerRef");
    expect(buyCourse).not.toMatch(/setTimeout\([^)]*navigate\(`\/my-courses/);
  });

  it("remembers the purchase on the device BEFORE the in-app sheet opens (native + web)", () => {
    const idx = buyCourse.indexOf("openNativeRazorpayCheckout({");
    const before = buyCourse.slice(Math.max(0, idx - 600), idx);
    expect(before).toContain("rememberPendingPayment(");
    const webIdx = buyCourse.indexOf("await openRazorpayCheckout({");
    const webBefore = buyCourse.slice(Math.max(0, webIdx - 400), webIdx);
    expect(webBefore).toContain("rememberPendingPayment(");
  });

  it("a dismissed sheet triggers exactly one quiet safety check on both platforms", () => {
    const calls = buyCourse.match(/void settleAfterDismiss\(\)/g) ?? [];
    expect(calls.length).toBe(2);
    expect(buyCourse).toContain("dismissSafetyCheck(");
  });

  it("only one enrollment poller runs at a time", () => {
    const resume = read("src/hooks/usePaymentResume.ts");
    expect(resume).toContain('pathname.startsWith("/buy-course")');
    expect(resume).toContain('get("payment") === "success"');
    expect(resume).toContain("anotherPollerOwnsIt");
    const sync = read("src/hooks/usePaymentSync.ts");
    expect(sync).toContain("clearPendingPayment()");
  });
});
