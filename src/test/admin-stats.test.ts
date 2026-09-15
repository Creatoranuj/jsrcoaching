import { describe, it, expect } from "vitest";
import { paymentTotals } from "@/features/admin/lib/adminStats";

const NOW = new Date("2026-03-15T10:00:00.000Z");
const today = "2026-03-15T08:00:00.000Z";
const earlierThisMonth = "2026-03-02T08:00:00.000Z";
const lastMonth = "2026-02-10T08:00:00.000Z";

describe("paymentTotals", () => {
  it("returns zeroes for empty input", () => {
    expect(paymentTotals([], [], NOW)).toEqual({
      todayAmount: 0, todayCount: 0, monthAmount: 0, monthCount: 0,
      manualAmount: 0, manualCount: 0, razorpayAmount: 0, razorpayCount: 0,
    });
  });

  it("only counts approved manual and completed razorpay payments", () => {
    const manual = [
      { status: "approved", amount: 100, created_at: today },
      { status: "pending", amount: 999, created_at: today },
      { status: "rejected", amount: 999, created_at: today },
    ];
    const rzp = [
      { status: "completed", amount: 200, created_at: today },
      { status: "refunded", amount: 999, created_at: today },
    ];
    const t = paymentTotals(manual, rzp, NOW);
    expect(t.manualAmount).toBe(100);
    expect(t.manualCount).toBe(1);
    expect(t.razorpayAmount).toBe(200);
    expect(t.razorpayCount).toBe(1);
    expect(t.todayAmount).toBe(300);
    expect(t.todayCount).toBe(2);
  });

  it("matches statuses case-insensitively", () => {
    const t = paymentTotals(
      [{ status: "Approved", amount: 50, created_at: today }],
      [{ status: "COMPLETED", amount: 70, created_at: today }],
      NOW,
    );
    expect(t.todayAmount).toBe(120);
    expect(t.todayCount).toBe(2);
  });

  it("splits today from the rest of the month and excludes older months", () => {
    const t = paymentTotals(
      [
        { status: "approved", amount: 10, created_at: today },
        { status: "approved", amount: 20, created_at: earlierThisMonth },
        { status: "approved", amount: 40, created_at: lastMonth },
      ],
      [],
      NOW,
    );
    expect(t.todayAmount).toBe(10);
    expect(t.todayCount).toBe(1);
    expect(t.monthAmount).toBe(30);
    expect(t.monthCount).toBe(2);
    expect(t.manualAmount).toBe(70);
  });

  it("treats missing amounts as zero without dropping the count", () => {
    const t = paymentTotals([{ status: "approved", created_at: today }], [], NOW);
    expect(t.todayAmount).toBe(0);
    expect(t.todayCount).toBe(1);
  });

  it("tolerates undefined inputs", () => {
    expect(paymentTotals(undefined as any, undefined as any, NOW).todayCount).toBe(0);
  });
});
