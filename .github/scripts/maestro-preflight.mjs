#!/usr/bin/env node
/**
 * Maestro credential preflight.
 *
 * Run #89 (2026-09-23) got all the way to the login screen, typed the stored
 * account and was told "Invalid email or password." — the emulator, WebView
 * devtools and flow tokens were finally right, and a stale password secret
 * still burned a 10-minute run. This script tries every candidate secret
 * pair against the same Supabase password grant the app uses and exports the
 * FIRST pair that actually signs in as MAESTRO_EMAIL / MAESTRO_PASSWORD via
 * $GITHUB_ENV (values masked). No pair working is a clear, early failure
 * that names the secrets to refresh instead of a screenshot of a red banner.
 *
 * Candidate order (first match wins):
 *   1. MAESTRO_EMAIL / MAESTRO_PASSWORD   — dedicated Android account, if set
 *   2. E2E_EMAIL / E2E_PASSWORD           — the pair playwright-e2e verifies
 *   3. TEST_USER_EMAIL / TEST_USER_PASSWORD
 *
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY).
 * Each attempt is one POST; a 429 aborts (the run would fail anyway).
 *
 * With the verified session it also resolves the fixture the secondary
 * `maestro/overlay-back.yaml` flow deep-links to — a lesson in an enrolled
 * course that has an image comment — and exports MAESTRO_COURSE_ID /
 * MAESTRO_LESSON_ID (same discovery as e2e-preflight's E2E_LESSON_ID). Missing
 * fixture is a notice, not a failure: the flow is non-blocking. The fixture is
 * matched against what the app really renders: unlocked lesson, non-hidden
 * comment, inside the newest-100 comment window (see useComments.ts).
 */
import { appendFileSync } from "node:fs";

const url = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const apiKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

if (!url || !apiKey) {
  console.error("::error::maestro-preflight: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY secrets are missing.");
  process.exit(1);
}

const candidates = [
  ["MAESTRO_EMAIL", "MAESTRO_PASSWORD"],
  ["E2E_EMAIL", "E2E_PASSWORD"],
  ["TEST_USER_EMAIL", "TEST_USER_PASSWORD"],
]
  .map(([e, p]) => ({ label: `${e}/${p}`, email: (process.env[e] ?? "").trim(), password: process.env[p] ?? "" }))
  .filter((c) => c.email && c.password);

if (candidates.length === 0) {
  console.error("::error::maestro-preflight: no credential pair set (MAESTRO_*, E2E_* or TEST_USER_*).");
  process.exit(1);
}

const mask = (v) => v && console.log(`::add-mask::${v}`);
const redact = (email) => email.replace(/^(.).*(@.*)$/, "$1***$2");

async function signIn({ email, password }) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, ok: res.ok && Boolean(body.access_token), body };
}

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");

/** Data API read as the verified student (RLS applies); failures read as []. */
async function rest(token, pathAndQuery) {
  try {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log(`::notice::maestro-preflight query ${pathAndQuery.split("?")[0]} → ${res.status} (ignored)`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

/**
 * The app only renders comments the student can actually see:
 * `useComments.ts` selects `is_hidden = false`, newest first, capped at 100.
 * A fixture that ignores those three rules resolves to a lesson whose image
 * comment never appears on screen, and the flow fails on a missing element.
 * Locked lessons are excluded for the same reason — the deep link lands on the
 * paywall instead of the lesson body.
 */
const VISIBLE_COMMENT_WINDOW = 100;
const UNLOCKED = "or=(is_locked.is.null,is_locked.eq.false)";

/**
 * True when the lesson's newest image comment is inside the window the app
 * actually renders (newest 100 non-hidden comments for that lesson).
 */
async function imageCommentIsVisible(token, lessonId) {
  const rows = await rest(
    token,
    `comments?select=image_url&lesson_id=eq.${lessonId}&is_hidden=eq.false&order=created_at.desc&limit=${VISIBLE_COMMENT_WINDOW}`,
  );
  return rows.some((r) => r.image_url);
}

/**
 * Lesson with a visible image comment inside a course the student can open.
 * Order: MAESTRO_LESSON_ID / E2E_LESSON_ID if still valid, then
 * MAESTRO_COURSE_ID / E2E_COURSE_ID, then every enrolled course.
 */
async function resolveOverlayFixture(token, userId) {
  const configuredLesson = (process.env.MAESTRO_LESSON_ID ?? process.env.E2E_LESSON_ID ?? "").trim();
  const configuredCourses = [process.env.MAESTRO_COURSE_ID, process.env.E2E_COURSE_ID]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);

  const openable = new Set(configuredCourses.map(safeId));
  const userFilter = userId ? `&user_id=eq.${safeId(userId)}` : "";
  for (const row of await rest(token, `enrollments?select=course_id${userFilter}&limit=200`)) {
    if (row.course_id != null) openable.add(safeId(row.course_id));
  }
  const searchOrder = [...openable];
  if (searchOrder.length === 0) {
    console.log("::notice::maestro-preflight: student has no openable course — overlay-back flow will be skipped.");
    return null;
  }

  if (configuredLesson) {
    const id = safeId(configuredLesson);
    const meta = await rest(token, `lessons?select=id,course_id&id=eq.${id}&limit=1`);
    if (meta.length > 0 && searchOrder.includes(safeId(meta[0].course_id))) {
      if (await imageCommentIsVisible(token, id)) return { lessonId: id, courseId: safeId(meta[0].course_id) };
    }
    console.log("::notice::maestro-preflight: configured lesson id has no image comment for this student — searching enrolled courses.");
  }

  for (const courseId of searchOrder) {
    const lessons = await rest(token, `lessons?select=id&course_id=eq.${courseId}&${UNLOCKED}&order=position.asc&limit=200`);
    if (lessons.length === 0) continue;
    const ids = lessons.map((l) => safeId(l.id)).join(",");
    const rows = await rest(
      token,
      `comments?select=lesson_id&lesson_id=in.(${ids})&is_hidden=eq.false&image_url=not.is.null&order=created_at.desc&limit=20`,
    );
    for (const row of rows) {
      const lessonId = safeId(row.lesson_id);
      if (await imageCommentIsVisible(token, lessonId)) {
        console.log(`::notice::maestro-preflight: overlay-back fixture → lesson ${lessonId} in course ${courseId} (visible image comment).`);
        return { lessonId, courseId };
      }
    }
  }
  console.log(`::notice::maestro-preflight: no lesson with an image comment in ${searchOrder.length} openable course(s) — overlay-back flow will be skipped. Post one comment with an image in the E2E course to enable it.`);
  return null;
}

const tried = [];
for (const c of candidates) {
  const r = await signIn(c);
  tried.push(`${c.label} (${redact(c.email)}) → ${r.status}`);
  if (r.ok) {
    mask(c.password);
    const fixture = await resolveOverlayFixture(r.body.access_token, r.body.user?.id);
    // Sign out the probe session so the flow's own sign-in is the only live one.
    // scope=local revokes ONLY this probe token: a global logout also killed the
    // Playwright suite's sessions whenever both ran on the same test account.
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: apiKey, Authorization: `Bearer ${r.body.access_token}` },
    }).catch(() => {});
    if (process.env.GITHUB_ENV) {
      const lines = [`MAESTRO_EMAIL=${c.email}`, `MAESTRO_PASSWORD=${c.password}`];
      if (fixture) lines.push(`MAESTRO_COURSE_ID=${fixture.courseId}`, `MAESTRO_LESSON_ID=${fixture.lessonId}`);
      appendFileSync(process.env.GITHUB_ENV, `${lines.join("\n")}\n`);
    }
    console.log(`✅ maestro-preflight: using ${c.label} (${redact(c.email)}) — sign-in verified.`);
    process.exit(0);
  }
  if (r.status === 429) {
    console.error(`::error::maestro-preflight: Supabase auth rate limit hit while probing ${c.label}. Re-run in a few minutes.`);
    process.exit(1);
  }
  const reason = r.body?.error_description ?? r.body?.msg ?? r.body?.error ?? "";
  console.log(`✗ ${c.label} (${redact(c.email)}) rejected: ${r.status} ${String(reason).slice(0, 80)}`);
}

console.error(`::error::maestro-preflight: none of the stored logins work — ${tried.join("; ")}. Refresh the password secret for the account the Android smoke should use.`);
process.exit(1);
