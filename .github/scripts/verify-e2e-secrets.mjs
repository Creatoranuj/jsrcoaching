#!/usr/bin/env node
/**
 * Preflight for the Playwright job.
 *
 * Confirms every E2E secret is (a) present and (b) actually usable — test
 * logins really authenticate, course/quiz IDs really exist. Prints a table of
 * OK / MISSING / INVALID without ever echoing a secret value.
 *
 * Exit 1 only when a *present* value is broken (that is a real config bug).
 * Absent optional secrets are reported and the job continues — the matching
 * specs skip themselves.
 */

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY;

const rows = [];
let hardFail = false;

function report(name, status, note = "") {
  rows.push({ name, status, note });
  if (status === "INVALID") hardFail = true;
}

async function checkLogin(emailVar, passVar, required) {
  const email = process.env[emailVar];
  const password = process.env[passVar];
  const label = `${emailVar} / ${passVar}`;

  if (!email || !password) {
    report(label, required ? "INVALID" : "MISSING", required ? "required secret is empty" : "optional — related specs skip");
    return null;
  }

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    const reason = /invalid[_ ]login/i.test(body) ? "wrong email or password" : `auth ${res.status}`;
    report(label, "INVALID", reason);
    return null;
  }

  const json = await res.json();
  report(label, "OK", "login succeeds");
  return json.access_token;
}

async function checkRow(idVar, table, token, required) {
  const id = process.env[idVar];
  if (!id) {
    report(idVar, required ? "INVALID" : "MISSING", required ? "required secret is empty" : "optional — related legs skip");
    return;
  }

  const res = await fetch(`${url}/rest/v1/${table}?select=id&id=eq.${encodeURIComponent(id)}`, {
    headers: {
      apikey: anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    report(idVar, "INVALID", `${table} read failed (${res.status})`);
    return;
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    report(idVar, "INVALID", `no row in ${table} with this id`);
    return;
  }
  report(idVar, "OK", `${table} row exists`);
}

if (!url || !anon) {
  console.error("::error::VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY secrets are missing");
  process.exit(1);
}

const studentToken =
  (await checkLogin("E2E_EMAIL", "E2E_PASSWORD", true)) ??
  (await checkLogin("TEST_USER_EMAIL", "TEST_USER_PASSWORD", true));

if (!rows.some((r) => r.name.startsWith("TEST_USER_EMAIL"))) {
  await checkLogin("TEST_USER_EMAIL", "TEST_USER_PASSWORD", true);
}

await checkLogin("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", false);

await checkRow("E2E_COURSE_ID", "courses", studentToken, true);
await checkRow("E2E_PAID_COURSE_ID", "courses", studentToken, true);
await checkRow("TEST_PAID_COURSE_ID", "courses", studentToken, true);
await checkRow("E2E_QUIZ_ID", "quizzes", studentToken, false);

const pad = (s, n) => String(s).padEnd(n);
const lines = [
  `| ${pad("Secret", 40)} | ${pad("Status", 8)} | Note`,
  `| ${"-".repeat(40)} | ${"-".repeat(8)} | ----`,
  ...rows.map((r) => `| ${pad(r.name, 40)} | ${pad(r.status, 8)} | ${r.note}`),
];
console.log(lines.join("\n"));

for (const r of rows) {
  if (r.status === "INVALID") console.log(`::error::${r.name}: ${r.note}`);
  else if (r.status === "MISSING") console.log(`::warning::${r.name}: ${r.note}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### E2E secret audit\n\n${lines.join("\n")}\n`);
}

process.exit(hardFail ? 1 : 0);
