// Pure payment-summary maths lifted out of the payments tab in
// src/pages/Admin.tsx. Kept side-effect free (and with an injectable `now`)
// so the revenue rules can be unit-tested without mounting the page.

export interface PaymentTotals {
  todayAmount: number;
  todayCount: number;
  monthAmount: number;
  monthCount: number;
  manualAmount: number;
  manualCount: number;
  razorpayAmount: number;
  razorpayCount: number;
}

const sum = (rows: any[]) => rows.reduce((s: number, p: any) => s + (p.amount || 0), 0);

/**
 * Revenue rules are a 1:1 port of the previous inline block:
 * only approved manual UPI payments and completed Razorpay payments count.
 * "Today" compares the ISO date prefix; "this month" compares against the
 * local month start converted to ISO, exactly as before.
 */
export function paymentTotals(
  manualPayments: any[] = [],
  razorpayPayments: any[] = [],
  now: Date = new Date(),
): PaymentTotals {
  const todayStr = now.toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const completedRzp = (razorpayPayments || []).filter(
    (p) => p.status?.toLowerCase() === "completed",
  );
  const approvedManual = (manualPayments || []).filter(
    (p) => p.status?.toLowerCase() === "approved",
  );

  const todayRzp = completedRzp.filter((p) => p.created_at?.startsWith(todayStr));
  const todayManual = approvedManual.filter((p) => p.created_at?.startsWith(todayStr));
  const monthRzp = completedRzp.filter((p) => p.created_at >= monthStart);
  const monthManual = approvedManual.filter((p) => p.created_at >= monthStart);

  return {
    todayAmount: sum(todayRzp) + sum(todayManual),
    todayCount: todayRzp.length + todayManual.length,
    monthAmount: sum(monthRzp) + sum(monthManual),
    monthCount: monthRzp.length + monthManual.length,
    manualAmount: sum(approvedManual),
    manualCount: approvedManual.length,
    razorpayAmount: sum(completedRzp),
    razorpayCount: completedRzp.length,
  };
}
