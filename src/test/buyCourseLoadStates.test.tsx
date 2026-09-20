import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Buy-screen load states (regression guard for the 2026-09-20 stuck-skeleton bug).
 *
 * A student on a dead/sleeping radio sat on the full-page skeleton forever,
 * because the course fetch had no timeout and no online check. The rules this
 * test locks in:
 *   1. offline  -> "Internet band hai" immediately, never an endless skeleton.
 *   2. hung     -> "Internet slow lag raha hai" once the 12s budget expires.
 *   3. retry    -> re-runs ONLY the course fetch (no window.location.reload).
 *   4. missing  -> genuine "Course not found", never the slow copy.
 */

vi.mock("@/lib/sentry", () => ({
  addBreadcrumb: vi.fn(),
  reportError: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
}));
vi.mock("@/lib/nativeChrome", () => ({
  tapLight: vi.fn(), tapMedium: vi.fn(), notifySuccess: vi.fn(), notifyError: vi.fn(),
}));
let resolveImpl: () => Promise<string | null> = async () => null;
vi.mock("@/lib/resolveContentUrl", () => ({ resolveContentUrl: () => resolveImpl() }));
vi.mock("@/utils/upiApps", () => ({ listUpiApps: async () => [] }));
vi.mock("@/hooks/useCourseAvailability", () => ({
  useCourseAvailability: () => ({ availability: null, loading: false }),
}));
vi.mock("@/hooks/useAdminEnrollment", () => ({
  useAdminEnrollment: () => ({ adminEnroll: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "s@x.com" }, isAdmin: false, isAuthenticated: true }),
}));

let singleImpl: () => Promise<{ data: unknown; error: unknown }>;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => singleImpl() }) }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

import BuyCourse from "@/pages/BuyCourse";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/buy-course?id=7"]}>
      <BuyCourse />
    </MemoryRouter>,
  );

const setOnline = (v: boolean) =>
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: v });

beforeEach(() => {
  setOnline(true);
  resolveImpl = async () => null;
  singleImpl = async () => ({ data: { id: 7, title: "Test", price: 499 }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  setOnline(true);
});

describe("BuyCourse load states", () => {
  it("shows the offline screen at once when the phone has no internet", async () => {
    setOnline(false);
    singleImpl = () => new Promise(() => {}); // must never be awaited
    renderPage();
    expect(await screen.findByText(/Internet band hai/i)).toBeTruthy();
  });

  it("shows the slow screen when the request times out or dies mid-flight", async () => {
    // withTimeout() rejects exactly like this once COURSE_FETCH_TIMEOUT_MS is up.
    singleImpl = async () => {
      throw Object.assign(new Error("Request timed out after 12000ms"), { name: "TimeoutError" });
    };
    renderPage();
    expect(await screen.findByText(/Internet slow lag raha hai/i)).toBeTruthy();
    expect(screen.queryByText(/Course not found/i)).toBeNull();
  });

  it("shows the course even when image signing never answers", async () => {
    // Storage signing is a second round-trip; it must never gate the Buy button.
    resolveImpl = () => new Promise<string | null>(() => {});
    singleImpl = async () => ({
      data: { id: 7, title: "Physics Crash Course", price: 499 },
      error: null,
    });
    renderPage();
    expect(await screen.findByText(/Physics Crash Course/i)).toBeTruthy();
  });

  it("time-boxes the course fetch at 12s instead of waiting forever", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/BuyCourse.tsx"), "utf8");
    expect(src).toContain("COURSE_FETCH_TIMEOUT_MS = 12_000");
    expect(src).toContain("await withTimeout(");
    expect(src).toContain("COURSE_FETCH_TIMEOUT_MS,");
    // The old unbounded `select("*")` on courses must not come back.
    expect(src).not.toContain('.select("*")');
  });

  it("retry re-runs only the course fetch and never reloads the app", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload, href: "http://localhost/buy-course/7" },
    });
    setOnline(false);
    renderPage();
    await screen.findByText(/Internet band hai/i);

    setOnline(true);
    singleImpl = async () => ({ data: { id: 7, title: "Recovered", price: 499 }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Dobara koshish karein/i }));

    await waitFor(() => expect(screen.queryByText(/Internet band hai/i)).toBeNull());
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps 'Course not found' for a course that genuinely does not exist", async () => {
    singleImpl = async () => ({ data: null, error: { message: "No rows" } });
    renderPage();
    expect(await screen.findByText(/Course not found/i)).toBeTruthy();
    expect(screen.queryByText(/Internet slow lag raha hai/i)).toBeNull();
  });
});
