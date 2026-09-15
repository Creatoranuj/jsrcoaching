// Pure, UI-free logic lifted out of src/pages/Admin.tsx.
//
// Everything here is deliberately side-effect free so the admin dashboard's
// trickiest rules (payment unification across two providers, search/status
// filtering, CSV shaping) can be unit-tested without mounting the page or
// touching Supabase. Behaviour is a 1:1 port of the previous inline code.

export type PaymentMethod = "upi" | "razorpay";

export type PaymentStatusFilter =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "refunded"
  | "all";

export type UserRoleFilter = "all" | "student" | "teacher" | "admin";

export interface AdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string | null;
  role: string | null;
}

export interface UnifiedPayment {
  [key: string]: any;
  _method: PaymentMethod;
  _key: string;
  _displayName: string;
  _email: string;
  _course: string;
  _amount: number | null;
  _status: string | null;
  _date: string | null;
}

/**
 * Merge manual (UPI) payment requests and Razorpay payments into one list,
 * newest first. The `_`-prefixed fields are the normalised view the payments
 * tab renders from, so both providers can share a single row component.
 */
export function unifyPayments(
  manualPayments: any[] = [],
  razorpayPayments: any[] = [],
): UnifiedPayment[] {
  const manual = (manualPayments || []).map((p) => ({
    ...p,
    _method: "upi" as const,
    _key: `upi-${p.id}`,
    _displayName: p.profiles?.full_name || p.sender_name || p.user_name || "Unknown",
    _email: p.profiles?.email || "",
    _course: p.courses?.title || "Unknown Course",
    _amount: p.amount,
    _status: p.status,
    _date: p.created_at,
  }));
  const rzp = (razorpayPayments || []).map((p) => ({
    ...p,
    _method: "razorpay" as const,
    _key: `rzp-${p.id}`,
    _displayName: p.profiles?.full_name || "Online Payment",
    _email: p.profiles?.email || "",
    _course: p.courses?.title || "Unknown Course",
    _amount: p.amount,
    _status: p.status,
    _date: p.created_at,
  }));
  return [...manual, ...rzp].sort(
    (a, b) => new Date(b._date).getTime() - new Date(a._date).getTime(),
  );
}

/** Free-text search across payer/course/transaction ids, plus status filter. */
export function filterPayments(
  payments: UnifiedPayment[],
  search: string,
  statusFilter: PaymentStatusFilter,
): UnifiedPayment[] {
  const s = (search || "").toLowerCase();
  return (payments || []).filter((p) => {
    const matchesSearch =
      !s ||
      p._displayName.toLowerCase().includes(s) ||
      p._email.toLowerCase().includes(s) ||
      p._course.toLowerCase().includes(s) ||
      !!p.transaction_id?.toLowerCase().includes(s) ||
      !!p.razorpay_payment_id?.toLowerCase().includes(s);
    const matchesStatus =
      statusFilter === "all" || p._status?.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });
}

/** Course search matches title or grade. */
export function filterCourses<T extends { title?: string | null; grade?: string | null }>(
  courses: T[],
  search: string,
): T[] {
  const s = (search || "").toLowerCase();
  return (courses || []).filter(
    (c) =>
      c.title?.toLowerCase().includes(s) || c.grade?.toLowerCase().includes(s),
  );
}

/** User search matches name/email/mobile, combined with the role dropdown. */
export function filterUsers(
  users: AdminUser[],
  search: string,
  roleFilter: UserRoleFilter,
): AdminUser[] {
  const s = (search || "").toLowerCase();
  return (users || []).filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      u.mobile?.toLowerCase().includes(s);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });
}

/** Everyone currently holding the teacher role. */
export function activeTeachers(users: AdminUser[]): AdminUser[] {
  return (users || []).filter((u) => u.role === "teacher");
}

/**
 * Students (or role-less signups) who can be promoted to teacher, narrowed by
 * the teachers tab search box.
 */
export function promotableStudents(users: AdminUser[], search: string): AdminUser[] {
  const s = (search || "").toLowerCase();
  return (users || []).filter(
    (u) =>
      (u.role === "student" || !u.role) &&
      (u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s)),
  );
}

/**
 * Build CSV text from a row list. Id-ish and object columns are dropped (they
 * are noise in an export), and comma-bearing values get quoted.
 * Returns null when there is nothing to export.
 */
export function buildCsv(data: any[]): string | null {
  if (!data || data.length === 0) return null;
  const headers = Object.keys(data[0]).filter(
    (k) => !k.includes("id") && typeof data[0][k] !== "object",
  );
  return [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (typeof val === "string" && val.includes(",")) return `"${val}"`;
          return val ?? "";
        })
        .join(","),
    ),
  ].join("\n");
}

/** `users_2026-01-31.csv` style download name. */
export function csvFileName(prefix: string, now: Date = new Date()): string {
  return `${prefix}_${now.toISOString().split("T")[0]}.csv`;
}
