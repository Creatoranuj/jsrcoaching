#!/usr/bin/env node
/**
 * Prints every failed / timed-out Playwright test as plain text:
 *   - into the job log as ::error:: annotations (readable via the GitHub API,
 *     no artifact zip needed)
 *   - into $GITHUB_STEP_SUMMARY as a compact table
 *
 * Reads test-results/results.json (Playwright JSON reporter). Never fails the
 * job itself: the test step already owns the pass/fail gate.
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";

const FILE = process.argv[2] || "test-results/results.json";

if (!existsSync(FILE)) {
  console.log(`No ${FILE} found — nothing to summarise.`);
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(FILE, "utf8"));
} catch (err) {
  console.log(`Could not parse ${FILE}: ${err.message}`);
  process.exit(0);
}

const failures = [];

const firstLine = (s) =>
  String(s || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ")
    .slice(0, 400);

const walk = (suite, trail = []) => {
  const path = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const bad = t.results?.filter((r) =>
        ["failed", "timedOut", "interrupted"].includes(r.status),
      );
      if (!bad?.length || t.status === "expected") continue;
      const last = bad[bad.length - 1];
      failures.push({
        file: spec.file || suite.file || "?",
        line: spec.line ?? 0,
        title: [...path, spec.title].filter(Boolean).join(" › "),
        status: last.status,
        error: firstLine(last.error?.message || last.errors?.[0]?.message),
      });
    }
  }
  for (const child of suite.suites || []) walk(child, path);
};

for (const suite of report.suites || []) walk(suite);

const stats = report.stats || {};
console.log(
  `Playwright stats: ${stats.expected ?? "?"} passed, ${stats.unexpected ?? "?"} failed, ` +
    `${stats.skipped ?? "?"} skipped, ${stats.flaky ?? "?"} flaky`,
);

if (!failures.length) {
  console.log("No failed tests in the JSON report.");
} else {
  for (const f of failures) {
    // GitHub annotation — surfaces as check-run annotation text.
    console.log(
      `::error file=${f.file},line=${f.line},title=E2E ${f.status}::${f.title} — ${f.error || "no error message"}`,
    );
  }
}

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const lines = [
    "## 🎭 Playwright failures",
    "",
    `passed: **${stats.expected ?? "?"}** · failed: **${stats.unexpected ?? "?"}** · skipped: **${stats.skipped ?? "?"}** · flaky: **${stats.flaky ?? "?"}**`,
    "",
  ];
  if (!failures.length) {
    lines.push("No failed tests. ✅");
  } else {
    lines.push("| # | test | file:line | status | error |", "|---|---|---|---|---|");
    failures.forEach((f, i) => {
      lines.push(
        `| ${i + 1} | ${f.title.replace(/\|/g, "\\|")} | \`${f.file}:${f.line}\` | ${f.status} | ${(f.error || "").replace(/\|/g, "\\|")} |`,
      );
    });
  }
  appendFileSync(summary, lines.join("\n") + "\n");
}
