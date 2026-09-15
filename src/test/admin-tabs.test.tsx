import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookOpen, Users } from "lucide-react";
import { AdminOverviewTab } from "@/features/admin/components/AdminOverviewTab";
import { AdminStatsGrid } from "@/features/admin/components/AdminStatsGrid";
import { AdminPaymentsTab } from "@/features/admin/components/AdminPaymentsTab";
import { AdminTeachersTab } from "@/features/admin/components/AdminTeachersTab";
import { AdminCoursesTab } from "@/features/admin/components/AdminCoursesTab";
import { AdminRefundDialog } from "@/features/admin/components/AdminRefundDialog";
import type { AdminUser } from "@/features/admin/lib/adminFilters";

const emptyTotals = {
  todayAmount: 0, todayCount: 0, monthAmount: 0, monthCount: 0,
  manualAmount: 0, manualCount: 0, razorpayAmount: 0, razorpayCount: 0,
};

describe("AdminOverviewTab", () => {
  const stats = [
    { label: "Total Students", value: 42, icon: Users, color: "text-blue-600", tab: "users" },
  ];
  const quickActions = [
    { label: "Courses", description: "Create & edit courses", icon: BookOpen, tab: "courses" },
    { label: "Live Classes", description: "Go live", icon: BookOpen, tab: "live", route: "/admin/live" },
  ];

  it("renders quick actions", () => {
    render(<AdminOverviewTab quickActions={quickActions} onSelectTab={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText("Courses")).toBeTruthy();
    expect(screen.getByText("Live Classes")).toBeTruthy();
  });

  it("renders stats and selects a tab when a stat card is clicked", () => {
    const onSelectTab = vi.fn();
    render(<AdminStatsGrid stats={stats} onSelectTab={onSelectTab} />);
    expect(screen.getByText("42")).toBeTruthy();
    fireEvent.click(screen.getByText("Total Students"));
    expect(onSelectTab).toHaveBeenCalledWith("users");
  });

  it("prefers the route over the tab for quick actions that have both", () => {
    const onNavigate = vi.fn();
    const onSelectTab = vi.fn();
    render(<AdminOverviewTab quickActions={quickActions} onSelectTab={onSelectTab} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Live Classes"));
    expect(onNavigate).toHaveBeenCalledWith("/admin/live");
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});

describe("AdminPaymentsTab", () => {
  const upiPending: any = {
    _key: "upi-1", _method: "upi", _status: "pending", _amount: 499, _course: "Class 10 Science",
    _displayName: "Asha", _email: "asha@example.com", _date: "2026-03-10T05:00:00Z",
    id: 7, sender_name: "Asha", transaction_id: "UTR123", screenshot_url: "receipts/a.png",
  };
  const rzpDone: any = {
    _key: "rzp-1", _method: "razorpay", _status: "completed", _amount: 999, _course: "Class 12 Maths",
    _displayName: "Ravi", _date: "2026-03-11T05:00:00Z",
    razorpay_order_id: "order_abcd1234", razorpay_payment_id: "pay_9999",
  };

  const renderTab = (over: Partial<React.ComponentProps<typeof AdminPaymentsTab>> = {}) =>
    render(
      <AdminPaymentsTab
        payments={[upiPending, rzpDone]}
        totalRevenue={1498}
        totals={emptyTotals}
        search=""
        onSearchChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        refundingPayment={null}
        onExport={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRefund={vi.fn()}
        onViewScreenshot={vi.fn()}
        {...over}
      />,
    );

  it("shows the payment count and both rows", () => {
    renderTab();
    expect(screen.getByText(/All Payments \(2\)/)).toBeTruthy();
    expect(screen.getByText("Class 10 Science")).toBeTruthy();
    expect(screen.getByText("Class 12 Maths")).toBeTruthy();
  });

  it("approves and rejects pending UPI payments", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    renderTab({ onApprove, onReject });
    fireEvent.click(screen.getByText("Approve"));
    fireEvent.click(screen.getByText("Reject"));
    expect(onApprove).toHaveBeenCalledWith(upiPending);
    expect(onReject).toHaveBeenCalledWith(7);
  });

  it("opens the receipt screenshot", () => {
    const onViewScreenshot = vi.fn();
    renderTab({ onViewScreenshot });
    fireEvent.click(screen.getByText("View Screenshot"));
    expect(onViewScreenshot).toHaveBeenCalledWith(upiPending);
  });

  it("offers a refund for completed razorpay payments", () => {
    const onRefund = vi.fn();
    renderTab({ onRefund });
    fireEvent.click(screen.getByText("Refund"));
    expect(onRefund).toHaveBeenCalledWith(rzpDone);
  });

  it("disables the refund button while a refund is in flight", () => {
    renderTab({ refundingPayment: "rzp-1" });
    expect((screen.getByText("Refund").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an empty state when there are no payments", () => {
    renderTab({ payments: [] });
    expect(screen.getByText("No payments found.")).toBeTruthy();
  });
});

describe("AdminTeachersTab", () => {
  const teacher: AdminUser = { id: "t1", full_name: "Meera", email: "meera@example.com", mobile: null, created_at: "2026-01-01T00:00:00Z", role: "teacher" };
  const student: AdminUser = { id: "s1", full_name: "Rohit", email: "rohit@example.com", mobile: null, created_at: "2026-01-02T00:00:00Z", role: "student" };

  const renderTab = (over: Partial<React.ComponentProps<typeof AdminTeachersTab>> = {}) =>
    render(
      <AdminTeachersTab
        activeTeachers={[teacher]}
        promotableStudents={[student]}
        search=""
        onSearchChange={vi.fn()}
        roleChanging={{}}
        onChangeRole={vi.fn()}
        {...over}
      />,
    );

  it("lists active teachers with a count", () => {
    renderTab();
    expect(screen.getByText(/Active Teachers \(1\)/)).toBeTruthy();
    expect(screen.getByText("Meera")).toBeTruthy();
  });

  it("promotes a student and revokes a teacher", () => {
    const onChangeRole = vi.fn();
    renderTab({ onChangeRole });
    fireEvent.click(screen.getByText("Make Teacher"));
    fireEvent.click(screen.getByText("Revoke"));
    expect(onChangeRole).toHaveBeenCalledWith("s1", "teacher");
    expect(onChangeRole).toHaveBeenCalledWith("t1", "student");
  });

  it("shows a search-aware empty state", () => {
    renderTab({ promotableStudents: [], search: "zzz" });
    expect(screen.getByText("No students match your search.")).toBeTruthy();
  });
});

describe("AdminCoursesTab", () => {
  const form = { title: "", description: "", price: "", grade: "", startDate: "", endDate: "" };
  const course = { id: 3, title: "Class 9 Maths", price: 299, grade: "9", thumbnail_url: null };

  const renderTab = (over: Partial<React.ComponentProps<typeof AdminCoursesTab>> = {}) =>
    render(
      <AdminCoursesTab
        newCourse={form}
        onNewCourseChange={vi.fn()}
        isCreatingCourse={false}
        onCreateCourse={vi.fn()}
        thumbnailFile={null}
        onThumbnailFileChange={vi.fn()}
        courseThumbnailUrl=""
        onCourseThumbnailUrlChange={vi.fn()}
        courseThumbnailMode="file"
        onCourseThumbnailModeChange={vi.fn()}
        courses={[course]}
        search=""
        onSearchChange={vi.fn()}
        onExport={vi.fn()}
        editingCourseId={null}
        editCourseData={form}
        onEditCourseDataChange={vi.fn()}
        editThumbnailFile={null}
        onEditThumbnailFileChange={vi.fn()}
        editThumbnailUrl=""
        onEditThumbnailUrlChange={vi.fn()}
        editThumbnailMode="file"
        onEditThumbnailModeChange={vi.fn()}
        onEditCourse={vi.fn()}
        onSaveCourseEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteCourse={vi.fn()}
        {...over}
      />,
    );

  it("renders the create form and the course list", () => {
    renderTab();
    expect(screen.getAllByText("Create Course").length).toBeGreaterThan(0);
    expect(screen.getByText("Class 9 Maths")).toBeTruthy();
  });

  it("creates a course", () => {
    const onCreateCourse = vi.fn();
    renderTab({ onCreateCourse });
    fireEvent.click(screen.getByRole("button", { name: /Create Course/ }));
    expect(onCreateCourse).toHaveBeenCalled();
  });

  it("switches the thumbnail mode to URL", () => {
    const onCourseThumbnailModeChange = vi.fn();
    renderTab({ onCourseThumbnailModeChange });
    fireEvent.click(screen.getAllByText("URL")[0]);
    expect(onCourseThumbnailModeChange).toHaveBeenCalledWith("url");
  });

  it("saves and cancels an inline edit", () => {
    const onSaveCourseEdit = vi.fn();
    const onCancelEdit = vi.fn();
    renderTab({ editingCourseId: 3, onSaveCourseEdit, onCancelEdit });
    fireEvent.click(screen.getByText("Save"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onSaveCourseEdit).toHaveBeenCalled();
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it("shows an empty state when there are no courses", () => {
    renderTab({ courses: [] });
    expect(screen.getByText("No courses found.")).toBeTruthy();
  });
});

describe("AdminRefundDialog", () => {
  const payment = { _key: "rzp-1", _amount: 999, _course: "Class 12 Maths" };

  const renderDialog = (over: Partial<React.ComponentProps<typeof AdminRefundDialog>> = {}) =>
    render(
      <AdminRefundDialog
        payment={payment}
        confirmText=""
        onConfirmTextChange={vi.fn()}
        amountText=""
        onAmountTextChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        {...over}
      />,
    );

  it("keeps the confirm button locked until REFUND is typed exactly", () => {
    renderDialog();
    expect((screen.getByText("Confirm Refund").closest("button") as HTMLButtonElement).disabled).toBe(true);
    renderDialog({ confirmText: "refund" });
    expect((screen.getAllByText("Confirm Refund")[1].closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("unlocks and confirms once REFUND is typed", () => {
    const onConfirm = vi.fn();
    renderDialog({ confirmText: "REFUND", onConfirm });
    fireEvent.click(screen.getByText("Confirm Refund"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels without refunding", () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders nothing when no payment is selected", () => {
    renderDialog({ payment: null });
    expect(screen.queryByText("Confirm Refund")).toBeNull();
  });
});
