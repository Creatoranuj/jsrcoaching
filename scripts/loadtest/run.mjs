#!/usr/bin/env node
/**
 * Production-safe load test for the JSR Coaching web app + Supabase backend.
 *
 * Why not k6/artillery: CI runners here only have Node/Bun, and the point is a
 * repeatable, *bounded* probe — this project runs on a Supabase free tier, so
 * an unbounded flood would take the real students' backend down rather than
 * measure it. The runner therefore:
 *   - caps total requests (--max-requests) as well as duration,
 *   - stops immediately on HTTP 429 or a sustained error/latency breach,
 *   - only ever issues anonymous GET reads (never writes, never auth).
 *
 * Usage:
 *   node scripts/loadtest/run.mjs --users 10 --duration 30
 *   node scripts/loadtest/run.mjs --base https://jsrcoaching.vercel.app --users 25 --duration 60
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { summarize, shouldAbort, evaluate, toMarkdown } from "./stats.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = (arg("base", process.env.LOADTEST_BASE_URL || "https://jsrcoaching.vercel.app")).replace(/\/$/, "");
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const USERS = Number(arg("users", 10));
const DURATION_SEC = Number(arg("duration", 30));
const MAX_REQUESTS = Number(arg("max-requests", 3000));
const OUT_DIR = arg("out", "docs/loadtest");

/** Anonymous, read-only scenarios. Budgets are what a student on 4G tolerates. */
const scenarios = [
  { name: "web:home", url: `${BASE}/`, budget: { p95Ms: 2500, maxErrorRate: 0.02 } },
  { name: "web:courses", url: `${BASE}/courses`, budget: { p95Ms: 2500, maxErrorRate: 0.02 } },
  { name: "web:manifest", url: `${BASE}/manifest.webmanifest`, budget: { p95Ms: 1500, maxErrorRate: 0.05 } },
];

if (SUPABASE_URL && SUPABASE_KEY) {
  scenarios.push({
    name: "api:courses",
    url: `${SUPABASE_URL}/rest/v1/courses?select=id,title,thumbnail_url&limit=12`,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" },
    budget: { p95Ms: 1500, maxErrorRate: 0.02 },
  });
} else {
  console.warn("! Supabase env missing — backend scenarios skipped (set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)");
}

async function hit(scenario) {
  const started = performance.now();
  try {
    const res = await fetch(scenario.url, {
      headers: { "user-agent": "jsr-loadtest/1.0", ...(scenario.headers || {}) },
      redirect: "follow",
    });
    await res.arrayBuffer();
    return { ms: performance.now() - started, status: res.status, ok: res.ok };
  } catch (err) {
    return { ms: performance.now() - started, status: 0, ok: false, error: String(err) };
  }
}

async function runScenario(scenario, budgetRequests) {
  const deadline = Date.now() + DURATION_SEC * 1000;
  const results = [];
  let aborted = null;
  const startedAt = performance.now();

  const worker = async () => {
    while (Date.now() < deadline && results.length < budgetRequests && !aborted) {
      results.push(await hit(scenario));
      if (results.length % 25 === 0) {
        aborted = shouldAbort(summarize(scenario.name, results, performance.now() - startedAt));
      }
    }
  };

  await Promise.all(Array.from({ length: USERS }, worker));
  const summary = summarize(scenario.name, results, performance.now() - startedAt);
  return { summary, aborted, verdict: evaluate(summary, scenario.budget) };
}

const startedAt = new Date().toISOString();
const perScenario = Math.max(50, Math.floor(MAX_REQUESTS / scenarios.length));
const summaries = [];
let abortReason = null;
const failures = [];

for (const scenario of scenarios) {
  process.stdout.write(`→ ${scenario.name} … `);
  const { summary, aborted, verdict } = await runScenario(scenario, perScenario);
  summaries.push(summary);
  console.log(
    `${summary.requests} req · ${summary.ok} ok · p95 ${summary.p95}ms · ${verdict.pass ? "within budget" : verdict.issues.join(", ")}`,
  );
  if (!verdict.pass) failures.push(`${scenario.name}: ${verdict.issues.join(", ")}`);
  if (aborted) {
    abortReason = `${scenario.name}: ${aborted}`;
    console.error(`! aborting remaining scenarios — ${aborted}`);
    break;
  }
}

const verdict = abortReason ? "ABORTED" : failures.length ? "OVER BUDGET" : "PASS";
const meta = { startedAt, baseUrl: BASE, users: USERS, durationSec: DURATION_SEC, maxRequests: MAX_REQUESTS, verdict, abortReason };

mkdirSync(OUT_DIR, { recursive: true });
const stamp = startedAt.replace(/[:.]/g, "-");
writeFileSync(`${OUT_DIR}/${stamp}.json`, JSON.stringify({ meta, summaries }, null, 2));
writeFileSync(`${OUT_DIR}/${stamp}.md`, toMarkdown(meta, summaries));

console.log(`\nVerdict: ${verdict}`);
console.log(`Report: ${OUT_DIR}/${stamp}.md`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
process.exit(verdict === "PASS" ? 0 : 1);
