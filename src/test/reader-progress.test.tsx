import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReaderProgress from "@/components/course/ReaderProgress";

function progress(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("pdf-progress", { detail }));
}

describe("ReaderProgress staged PDF readiness", () => {
  it("keeps byte progress below completion until the first page is ready", () => {
    render(<ReaderProgress visible title="Archive PDF" variant="pdf" />);

    act(() => progress({ percent: 70, phase: "downloading", measured: true }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByText(/Opening Archive PDF — 70%/)).toBeInTheDocument();

    act(() => progress({ percent: 92, phase: "rendering", measured: false }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "92");
    expect(screen.getByText(/Preparing first page — 92%/)).toBeInTheDocument();

    act(() => window.dispatchEvent(new CustomEvent("pdf-ready")));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("still shows a moving number when a stream has no measurable total", () => {
    vi.useFakeTimers();
    render(<ReaderProgress visible title="Large PDF" variant="pdf" />);

    act(() => progress({ percent: -1, phase: "downloading", fallback: true }));
    act(() => vi.advanceTimersByTime(4000));
    const shown = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(shown).toBeGreaterThan(0);
    // Simulated curve for the canvas PDF path never pretends to be near done.
    expect(shown).toBeLessThanOrEqual(40);
    expect(screen.getByText(new RegExp(`Opening Large PDF — ${shown}%`))).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("prefers measured bytes over the simulated curve", () => {
    vi.useFakeTimers();
    render(<ReaderProgress visible title="Probed PDF" variant="pdf" />);
    act(() => vi.advanceTimersByTime(10_000));
    act(() => progress({ percent: 55, phase: "downloading", measured: true }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "55");
    vi.useRealTimers();
  });

  it("never moves backwards when Range events arrive out of order", () => {
    render(<ReaderProgress visible title="Range PDF" variant="pdf" />);

    act(() => progress({ percent: 64, phase: "downloading" }));
    act(() => progress({ percent: 41, phase: "downloading" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
  });

  it("keeps simulated iframe progress below ready", () => {
    vi.useFakeTimers();
    render(<ReaderProgress visible title="Iframe PDF" variant="drive" />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThanOrEqual(90);
    vi.useRealTimers();
  });

  it("uses truthful Archive phases instead of whole-file byte progress", () => {
    vi.useFakeTimers();
    render(<ReaderProgress visible title="Botany Notes" variant="archive" />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/Connecting to Archive\.org/)).toBeInTheDocument();

    act(() => progress({ percent: 28, phase: "indexing" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "28");
    expect(screen.getByText(/Reading document index — 28%/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});