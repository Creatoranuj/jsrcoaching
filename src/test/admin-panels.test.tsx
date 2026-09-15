import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminUsersTab } from "@/features/admin/components/AdminUsersTab";
import { AdminSessionsTab } from "@/features/admin/components/AdminSessionsTab";
import { RoleBadge, StatusBadge } from "@/features/admin/components/AdminBadges";
import type { AdminUser } from "@/features/admin/lib/adminFilters";

const users: AdminUser[] = [
  { id: "u1", full_name: "Asha Verma", email: "asha@example.com", mobile: "9990001111", created_at: "2026-01-05T00:00:00Z", role: "student" },
];

const renderUsers = (over: Partial<React.ComponentProps<typeof AdminUsersTab>> = {}) =>
  render(
    <AdminUsersTab
      totalUsers={12}
      users={users}
      search=""
      onSearchChange={vi.fn()}
      roleFilter="all"
      onRoleFilterChange={vi.fn()}
      roleChanging={{}}
      onChangeRole={vi.fn()}
      onExport={vi.fn()}
      {...over}
    />,
  );

describe("AdminUsersTab", () => {
  it("shows the total user count in the heading", () => {
    renderUsers();
    expect(screen.getByText(/Registered Users \(12\)/)).toBeTruthy();
  });

  it("renders a user row with name and email", () => {
    renderUsers();
    expect(screen.getByText("Asha Verma")).toBeTruthy();
    expect(screen.getByText("asha@example.com")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    renderUsers({ users: [] });
    expect(screen.getByText("No users found.")).toBeTruthy();
  });

  it("reports typing in the search box", () => {
    const onSearchChange = vi.fn();
    renderUsers({ onSearchChange });
    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), { target: { value: "asha" } });
    expect(onSearchChange).toHaveBeenCalledWith("asha");
  });

  it("triggers the CSV export", () => {
    const onExport = vi.fn();
    renderUsers({ onExport });
    fireEvent.click(screen.getByText(/Export/));
    expect(onExport).toHaveBeenCalled();
  });

  it("shows a saving state while a role change is in flight", () => {
    renderUsers({ roleChanging: { u1: true } });
    expect(screen.getByText("Saving…")).toBeTruthy();
  });
});

const sessions = [
  {
    id: "s1",
    user_id: "u1",
    device_type: "mobile",
    user_agent: "Mozilla/5.0 test agent",
    logged_in_at: "2026-01-05T10:00:00Z",
    last_active_at: "2026-01-05T11:00:00Z",
  },
];

const renderSessions = (over: Partial<React.ComponentProps<typeof AdminSessionsTab>> = {}) =>
  render(
    <AdminSessionsTab
      sessions={sessions}
      loading={false}
      terminatingSession={null}
      onRefresh={vi.fn()}
      onForceLogout={vi.fn()}
      {...over}
    />,
  );

describe("AdminSessionsTab", () => {
  it("counts the active sessions", () => {
    renderSessions();
    expect(screen.getByText(/Active Sessions \(1\)/)).toBeTruthy();
  });

  it("shows the empty state with no sessions", () => {
    renderSessions({ sessions: [] });
    expect(screen.getByText("No active sessions")).toBeTruthy();
  });

  it("force-logs-out the right session", () => {
    const onForceLogout = vi.fn();
    renderSessions({ onForceLogout });
    fireEvent.click(screen.getByText("Logout"));
    expect(onForceLogout).toHaveBeenCalledWith("s1", "u1");
  });

  it("refreshes on demand", () => {
    const onRefresh = vi.fn();
    renderSessions({ onRefresh });
    fireEvent.click(screen.getByText(/Refresh/));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("disables the logout button for the session being terminated", () => {
    renderSessions({ terminatingSession: "s1" });
    expect(screen.queryByText("Logout")).toBeNull();
  });
});

describe("admin badges", () => {
  it("labels each role", () => {
    const { rerender } = render(<RoleBadge role="admin" />);
    expect(screen.getByText("Admin")).toBeTruthy();
    rerender(<RoleBadge role={null} />);
    expect(screen.getByText("No Role")).toBeTruthy();
  });

  it("labels payment statuses case-insensitively", () => {
    const { rerender } = render(<StatusBadge status="Approved" />);
    expect(screen.getByText("Approved")).toBeTruthy();
    rerender(<StatusBadge status="weird-value" />);
    expect(screen.getByText("Pending")).toBeTruthy();
  });
});
