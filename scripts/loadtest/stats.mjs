/**
 * Pure helpers for the load-test runner. Kept separate from run.mjs so they can
 * be unit-tested without firing a single request at production.
 */

/** Nearest-rank percentile (p in 0..100) over an unsorted sample array. */
export function percentile(samples, p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

export function summarize(name, results, wallMs) {
  const durations = results.map((r) => r.ms);
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const throttled = results.filter((r) => r.status === 429).length;
  const serverErrors = results.filter((r) => r.status >= 500).length;
  return {
    name,
    requests: results.length,
    ok,
    failed,
    throttled,
    serverErrors,
    errorRate: results.length ? failed / results.length : 0,
    rps: wallMs > 0 ? (results.length / wallMs) * 1000 : 0,
    p50: Math.round(percentile(durations, 50)),
    p90: Math.round(percentile(durations, 90)),
    p95: Math.round(percentile(durations, 95)),
    p99: Math.round(percentile(durations, 99)),
    max: durations.length ? Math.round(Math.max(...durations)) : 0,
  };
}

/**
 * Free-tier guard. Supabase free projects have modest connection/egress limits,
 * so the runner aborts instead of hammering a struggling backend.
 */
export function shouldAbort(summary, { maxErrorRate = 0.1, maxP95Ms = 8000 } = {}) {
  if (summary.requests < 20) return null;
  if (summary.throttled > 0) return `rate limited by the backend (${summary.throttled}x HTTP 429)`;
  if (summary.errorRate > maxErrorRate)
    return `error rate ${(summary.errorRate * 100).toFixed(1)}% above ${(maxErrorRate * 100).toFixed(0)}%`;
  if (summary.p95 > maxP95Ms) return `p95 ${summary.p95}ms above ${maxP95Ms}ms`;
  return null;
}

/** Budget verdicts per scenario — what "good enough for students on 4G" means. */
export function evaluate(summary, budget) {
  const issues = [];
  if (budget.p95Ms && summary.p95 > budget.p95Ms) issues.push(`p95 ${summary.p95}ms > ${budget.p95Ms}ms`);
  if (budget.maxErrorRate != null && summary.errorRate > budget.maxErrorRate)
    issues.push(`errors ${(summary.errorRate * 100).toFixed(1)}% > ${(budget.maxErrorRate * 100).toFixed(0)}%`);
  return { pass: issues.length === 0, issues };
}

export function toMarkdown(meta, summaries) {
  const rows = summaries
    .map(
      (s) =>
        `| ${s.name} | ${s.requests} | ${s.ok} | ${s.failed} | ${s.rps.toFixed(1)} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.max} |`,
    )
    .join("\n");
  return `# Load test — ${meta.startedAt}

- Target: ${meta.baseUrl}
- Virtual users: ${meta.users} · duration: ${meta.durationSec}s · request cap: ${meta.maxRequests}
- Verdict: **${meta.verdict}**${meta.abortReason ? `\n- Aborted early: ${meta.abortReason}` : ""}

| Scenario | Req | OK | Fail | req/s | p50 ms | p95 ms | p99 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}
`;
}
