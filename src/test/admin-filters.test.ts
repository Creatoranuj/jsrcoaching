import { describe, it, expect } from "vitest";
import {
  unifyPayments,
  filterPayments,
  filterCourses,
  filterUsers,
  activeTeachers,
  promotableStudents,
  buildCsv,
  csvFileName,
  type AdminUser,
} from "@/features/admin/lib/adminFilters";

const manual = [
  {
    id: 1,
    amount: 500,
    status: "pending",
    created_at: "2026-01-02T00:00:00Z",
    transaction_id: "TXN-AAA",
    profiles: { full_name: "Asha Verma", email: "asha@example.com" },
    courses: { title: "Class 10 Maths" },
  },
  {
    id: 2,
    amount: 900,
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    sender_name: "Walk-in",
    profiles: null,
    courses: null,
  },
];

const razorpay = [
  {
    id: 7,
    amount: 1200,
    status: "completed",
    created_at: "2026-01-03T00:00:00Z",
    razorpay_payment_id: "pay_ZZZ",
    profiles: { full_name: "Rahul Singh", email: "rahul@example.com" },
    courses: { title: "Class 12 Physics" },
  },
];

const users: AdminUser[] = [
  { id: "u1", full_name: "Asha Verma", email: "asha@example.com", mobile: "9990001111", created_at: null, role: "student" },
  { id: "u2", full_name: "Rahul Singh", email: "rahul@example.com", mobile: "9990002222", created_at: null, role: "teacher" },
  { id: "u3", full_name: "Neha Gupta", email: "neha@example.com", mobile: "9990003333", created_at: null, role: null },
  { id: "u4", full_name: "Admin Boss", email: "boss@example.com", mobile: null, created_at: null, role: "admin" },
];

describe("unifyPayments", () => {
  it("merges both providers newest-first", () => {
    const rows = unifyPayments(manual, razorpay);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r._key)).toEqual(["rzp-7", "upi-1", "upi-2"]);
  });

  it("tags each row with its method", () => {
    const rows = unifyPayments(manual, razorpay);
    expect(rows.find((r) => r._key === "upi-1")!._method).toBe("upi");
    expect(rows.find((r) => r._key === "rzp-7")!._method).toBe("razorpay");
  });

  it("falls back through profile, sender and default names", () => {
    const rows = unifyPayments(manual, razorpay);
    expect(rows.find((r) => r._key === "upi-1")!._displayName).toBe("Asha Verma");
    expect(rows.find((r) => r._key === "upi-2")!._displayName).toBe("Walk-in");
    expect(unifyPayments([], [{ id: 9, created_at: "2026-01-01" }])[0]._displayName).toBe("Online Payment");
  });

  it("labels a missing course as Unknown Course", () => {
    expect(unifyPayments(manual, [])[1]._course).toBe("Unknown Course");
  });

  it("handles empty inputs", () => {
    expect(unifyPayments()).toEqual([]);
  });
});

describe("filterPayments", () => {
  const rows = unifyPayments(manual, razorpay);

  it("returns everything with no search and status all", () => {
    expect(filterPayments(rows, "", "all")).toHaveLength(3);
  });

  it("searches payer name case-insensitively", () => {
    expect(filterPayments(rows, "rahul", "all").map((r) => r._key)).toEqual(["rzp-7"]);
  });

  it("searches by transaction and razorpay ids", () => {
    expect(filterPayments(rows, "txn-aaa", "all")).toHaveLength(1);
    expect(filterPayments(rows, "pay_zzz", "all")).toHaveLength(1);
  });

  it("filters by status case-insensitively", () => {
    expect(filterPayments(rows, "", "completed").map((r) => r._key)).toEqual(["rzp-7"]);
    expect(filterPayments(rows, "", "pending").map((r) => r._key)).toEqual(["upi-1"]);
  });

  it("combines search and status", () => {
    expect(filterPayments(rows, "asha", "approved")).toHaveLength(0);
  });
});

describe("filterCourses", () => {
  const courses = [
    { title: "Class 10 Maths", grade: "10" },
    { title: "Physics Crash", grade: "12" },
  ];

  it("matches on title", () => {
    expect(filterCourses(courses, "maths")).toHaveLength(1);
  });

  it("matches on grade", () => {
    expect(filterCourses(courses, "12")[0].title).toBe("Physics Crash");
  });
});

describe("filterUsers", () => {
  it("matches name, email or mobile", () => {
    expect(filterUsers(users, "neha", "all")).toHaveLength(1);
    expect(filterUsers(users, "rahul@example", "all")).toHaveLength(1);
    expect(filterUsers(users, "9990003333", "all")).toHaveLength(1);
  });

  it("filters by role", () => {
    expect(filterUsers(users, "", "teacher").map((u) => u.id)).toEqual(["u2"]);
  });
});

describe("teacher lists", () => {
  it("lists only teachers", () => {
    expect(activeTeachers(users).map((u) => u.id)).toEqual(["u2"]);
  });

  it("promotable includes students and role-less users", () => {
    expect(promotableStudents(users, "").map((u) => u.id)).toEqual(["u1", "u3"]);
  });

  it("promotable respects the search box", () => {
    expect(promotableStudents(users, "neha").map((u) => u.id)).toEqual(["u3"]);
  });
});

describe("buildCsv", () => {
  it("returns null for an empty export", () => {
    expect(buildCsv([])).toBeNull();
  });

  it("drops id-ish and object columns", () => {
    const csv = buildCsv([{ id: 1, user_id: "x", name: "Asha", meta: { a: 1 } }])!;
    expect(csv.split("\n")[0]).toBe("name");
  });

  it("quotes values containing commas", () => {
    const csv = buildCsv([{ name: "Verma, Asha", grade: "10" }])!;
    expect(csv.split("\n")[1]).toBe('"Verma, Asha",10');
  });

  it("blanks nullish cells and skips null columns (typeof null is object)", () => {
    const csv = buildCsv([{ name: "Asha", note: null }])!;
    expect(csv.split("\n")[0]).toBe("name");
    expect(buildCsv([{ name: "Asha", grade: undefined }])!.split("\n")[1]).toBe("Asha,");
  });

  it("names the file with an ISO date", () => {
    expect(csvFileName("users", new Date("2026-01-31T10:00:00Z"))).toBe("users_2026-01-31.csv");
  });
});
