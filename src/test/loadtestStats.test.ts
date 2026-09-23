import { describe, it, expect } from "vitest";
// @ts-expect-error — plain JS helper shared with the Node load-test runner
import { percentile, summarize, shouldAbort, evaluate, toMarkdown } from "../../scripts/loadtest/stats.mjs";

const mk = (ms: number, status = 200) => ({ ms, status, ok: status >= 200 && status < 400 });

describe("load-test stats", () => {
  it("computes nearest-rank percentiles", () => {
    const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(100);
    expect(percentile([], 95)).toBe(0);
  });

  it("summarizes ok/fail counts, throughput and latency", () => {
    const results = [mk(100), mk(200), mk(300), mk(400, 500), mk(150, 429)];
    const s = summarize("web:home", results, 1000);
    expect(s.requests).toBe(5);
    expect(s.ok).toBe(3);
    expect(s.failed).toBe(2);
    expect(s.serverErrors).toBe(1);
    expect(s.throttled).toBe(1);
    expect(s.rps).toBeCloseTo(5, 5);
    expect(s.max).toBe(400);
  });

  it("aborts as soon as the backend rate-limits us", () => {
    const results = [...Array(30)].map((_, i) => mk(100, i === 5 ? 429 : 200));
    expect(shouldAbort(summarize("api:courses", results, 1000))).toMatch(/rate limited/);
  });

  it("aborts on a sustained error rate or slow p95", () => {
    const errors = [...Array(30)].map((_, i) => mk(100, i < 10 ? 500 : 200));
    expect(shouldAbort(summarize("api", errors, 1000))).toMatch(/error rate/);
    const slow = [...Array(30)].map(() => mk(9000));
    expect(shouldAbort(summarize("api", slow, 1000))).toMatch(/p95/);
  });

  it("does not abort on a small or healthy sample", () => {
    expect(shouldAbort(summarize("api", [mk(100), mk(9000, 500)], 1000))).toBeNull();
    expect(shouldAbort(summarize("api", [...Array(30)].map(() => mk(200)), 1000))).toBeNull();
  });

  it("evaluates a scenario against its budget", () => {
    const fast = summarize("web:home", [...Array(30)].map(() => mk(300)), 1000);
    expect(evaluate(fast, { p95Ms: 2500, maxErrorRate: 0.02 }).pass).toBe(true);
    const slow = summarize("web:home", [...Array(30)].map(() => mk(4000)), 1000);
    const verdict = evaluate(slow, { p95Ms: 2500, maxErrorRate: 0.02 });
    expect(verdict.pass).toBe(false);
    expect(verdict.issues[0]).toContain("p95");
  });

  it("renders a markdown report", () => {
    const s = summarize("web:home", [mk(120)], 1000);
    const md = toMarkdown(
      { startedAt: "2026-09-23T08:00:00Z", baseUrl: "https://x.app", users: 5, durationSec: 10, maxRequests: 100, verdict: "PASS" },
      [s],
    );
    expect(md).toContain("Load test — 2026-09-23T08:00:00Z");
    expect(md).toContain("| web:home |");
    expect(md).toContain("**PASS**");
  });
});
