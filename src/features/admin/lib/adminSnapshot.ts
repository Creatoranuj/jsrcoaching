// Audit 2026-09-22 (Pillar 3 / P1): the admin dashboard issued ~12 Supabase
// requests strictly one after another (each `await` waited for the previous
// round-trip), so a cold /admin load cost ~12 × RTT before anything rendered.
// This module owns that fetch as one concurrent snapshot:
//   • every independent query starts in the same tick (Promise.allSettled)
//   • revenue / pending / student counters are derived from rows we already
//     hold instead of extra round-trips (12 requests → 7)
//   • one failing query no longer blanks the whole dashboard — the caller gets
//     the rows that did arrive plus a `failures` list to report.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { AdminUser, ManualPaymentRow, RazorpayPaymentRow } from "./adminFilters";

export interface AdminStats {
  totalStudents: number;
  totalCourses: number;
  pendingPayments: number;
  activeEnrollments: number;
  totalRevenue: number;
  activeSessions: number;
}

export interface AdminSnapshot {
  courses: Tables<"courses">[];
  enrollmentCounts: Record<number, number>;
  payments: ManualPaymentRow[];
  razorpayPayments: RazorpayPaymentRow[];
  users: AdminUser[];
  stats: AdminStats;
  /** Human-readable names of the queries that failed (empty when all succeeded). */
  failures: string[];
}

type Client = SupabaseClient<Database>;

const sumAmounts = (rows: Array<{ amount: number | null }>) =>
  rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

const statusIs = (value: unknown, expected: string) =>
  typeof value === "string" && value.toLowerCase() === expected;

export async function loadAdminSnapshot(supabase: Client): Promise<AdminSnapshot> {
  // Start every request before awaiting any of them.
  const tasks = {
    courses: supabase.from("courses").select("*"),
    activeEnrollments: supabase.from("enrollments").select("course_id").eq("status", "active"),
    profiles: supabase.from("profiles").select("*"),
    payments: supabase.from("payment_requests").select("*, courses (title)").order("created_at", { ascending: false }),
    razorpay: supabase.from("razorpay_payments").select("*, courses (title)").order("created_at", { ascending: false }),
    roles: supabase.from("user_roles").select("user_id, role"),
    enrollmentTotal: supabase.from("enrollments").select("*", { count: "exact", head: true }),
    activeSessions: supabase.from("user_sessions").select("*", { count: "exact", head: true }).eq("is_active", true),
  } as const;

  const names = Object.keys(tasks) as Array<keyof typeof tasks>;
  const settled = await Promise.allSettled(names.map((n) => tasks[n]));

  const failures: string[] = [];
  type SettledValue = { data?: unknown; count?: number | null; error?: { message?: string } | null };
  const pick = <T,>(name: keyof typeof tasks, read: (value: SettledValue) => T, fallback: T): T => {
    const result = settled[names.indexOf(name)];
    if (result.status === "rejected") {
      failures.push(String(name));
      return fallback;
    }
    const value = result.value as { error?: { message?: string } | null };
    if (value?.error) {
      failures.push(String(name));
      return fallback;
    }
    return read(result.value as SettledValue);
  };

  const rows = <R,>(r: SettledValue) => (r.data ?? []) as R[];
  const courses = pick<Tables<"courses">[]>("courses", rows, []);
  const enrollmentRows = pick<Array<{ course_id: number | null }>>("activeEnrollments", rows, []);
  const profiles = pick<Tables<"profiles">[]>("profiles", rows, []);
  const payRows = pick<ManualPaymentRow[]>("payments", rows, []);
  const rzpRows = pick<RazorpayPaymentRow[]>("razorpay", rows, []);
  const roles = pick<Array<{ user_id: string; role: string }>>("roles", rows, []);
  const enrollmentTotal = pick<number>("enrollmentTotal", (r) => r.count ?? 0, 0);
  const activeSessions = pick<number>("activeSessions", (r) => r.count ?? 0, 0);

  const enrollmentCounts: Record<number, number> = {};
  for (const row of enrollmentRows) {
    const cid = Number(row.course_id);
    enrollmentCounts[cid] = (enrollmentCounts[cid] || 0) + 1;
  }

  // profiles is not FK-linked to payment tables — join client-side.
  const profileMap = new Map<string, Tables<"profiles">>(profiles.map((p) => [p.id, p]));
  const withProfile = <T extends { user_id: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, profiles: profileMap.get(r.user_id) ?? null }));

  const roleByUser = new Map<string, string>();
  for (const r of roles) roleByUser.set(r.user_id, r.role);
  const users: AdminUser[] = profiles.map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    mobile: profile.mobile,
    created_at: profile.created_at,
    role: (roleByUser.get(profile.id) as AdminUser["role"]) || null,
  }));

  // Status values may be capitalised depending on how the row was inserted,
  // so revenue matching is case-insensitive (same rule the old ilike used).
  const manualRevenue = sumAmounts(payRows.filter((p) => statusIs(p.status, "approved")));
  const rzpRevenue = sumAmounts(rzpRows.filter((p) => statusIs(p.status, "completed")));

  return {
    courses,
    enrollmentCounts,
    payments: withProfile(payRows) as ManualPaymentRow[],
    razorpayPayments: withProfile(rzpRows) as RazorpayPaymentRow[],
    users,
    stats: {
      totalStudents: roles.filter((r) => r.role === "student").length,
      totalCourses: courses.length,
      pendingPayments: payRows.filter((p) => p.status === "pending").length,
      activeEnrollments: enrollmentTotal,
      totalRevenue: manualRevenue + rzpRevenue,
      activeSessions,
    },
    failures,
  };
}
