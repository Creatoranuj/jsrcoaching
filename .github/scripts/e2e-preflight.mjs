/**
 * E2E preflight — runs before Playwright in CI.
 *
 *  1. Fails fast when the required secrets are missing or the E2E student
 *     cannot sign in (a broken fixture must never look like an app bug).
 *  2. Verifies every configured course ID exists.
 *  3. Resolves optional fixtures *as the E2E student* so specs that used to
 *     skip for "secret not set / not attemptable" get real data:
 *       - E2E_QUIZ_ID   → a published quiz (with questions) the student can
 *                          attempt. The configured secret wins when it is
 *                          attemptable; otherwise the first attemptable quiz
 *                          in the configured courses is used.
 *       - E2E_LESSON_ID → a lesson in E2E_COURSE_ID that has at least one
 *                          comment with an image attachment (needed by
 *                          comment-image-in-app.spec.ts).
 *     Resolved values are appended to $GITHUB_ENV as *_RESOLVED so the
 *     workflow can prefer them over the raw secrets.
 *
 * Everything here uses the anon key + the student's own JWT, so RLS applies
 * exactly as it does in the browser — a fixture this script can see is a
 * fixture the test can use.
 */
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "E2E_EMAIL",
  "E2E_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`::error::Missing required E2E secrets: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.VITE_SUPABASE_URL.replace(/\/$/, "");
const apiKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const authResponse = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  }),
});

if (!authResponse.ok) {
  console.error(`::error::E2E student sign-in preflight failed (${authResponse.status}). Refresh the test-account secrets.`);
  process.exit(1);
}

const session = await authResponse.json();
if (!session.access_token) {
  console.error("::error::E2E student sign-in returned no access token.");
  process.exit(1);
}

const headers = {
  apikey: apiKey,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
};

/** PostgREST GET returning [] on any failure (fixture discovery must never fail the job). */
async function rest(pathAndQuery) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${pathAndQuery}`, { headers });
    if (!res.ok) {
      console.log(`::notice::preflight query ${pathAndQuery.split("?")[0]} → ${res.status} (ignored)`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch (err) {
    console.log(`::notice::preflight query ${pathAndQuery.split("?")[0]} threw ${err?.message ?? err} (ignored)`);
    return [];
  }
}

const VISIBLE_COMMENT_WINDOW = 100;
const UNLOCKED = "or=(is_locked.is.null,is_locked.eq.false)";

/** Newest image comment for a lesson is inside the window the app renders. */
async function imageCommentIsVisible(lessonId) {
  const rows = await rest(
    `comments?select=image_url&lesson_id=eq.${lessonId}&is_hidden=eq.false&order=created_at.desc&limit=${VISIBLE_COMMENT_WINDOW}`,
  );
  return rows.some((r) => r.image_url);
}


const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");

const courseIds = [...new Set([
  process.env.E2E_COURSE_ID,
  process.env.E2E_PAID_COURSE_ID,
  process.env.TEST_PAID_COURSE_ID,
].filter(Boolean))];

if (courseIds.length > 0) {
  const safeCourseIds = courseIds.map(safeId);
  const coursesResponse = await fetch(
    `${baseUrl}/rest/v1/courses?select=id&id=in.(${safeCourseIds.join(",")})`,
    { headers },
  );

  if (!coursesResponse.ok) {
    console.error(`::error::E2E course preflight could not read configured courses (${coursesResponse.status}).`);
    process.exit(1);
  }

  const courses = await coursesResponse.json();
  const found = new Set(courses.map((course) => String(course.id)));
  const missingCourses = courseIds.filter((id) => !found.has(String(id)));
  if (missingCourses.length > 0) {
    console.error(`::error::Configured E2E course IDs do not exist: ${missingCourses.join(", ")}`);
    process.exit(1);
  }
}

console.log(`E2E preflight passed: student sign-in and ${courseIds.length} configured course ID(s) verified.`);

// ---------------------------------------------------------------------------
// Optional fixture discovery (never fails the job).
// ---------------------------------------------------------------------------
const resolved = {};

async function quizHasQuestions(quizId) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/get_quiz_questions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ _quiz_id: quizId }),
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// Courses the E2E student can actually open: the configured ones, everything
// it is enrolled in, and free courses. RLS already hides the rest, but a quiz
// or lesson in a paid course the student never bought would bounce the spec
// to /dashboard, so discovery only looks inside this set.
async function openableCourseIds() {
  const ids = new Set(courseIds.map((id) => String(id)));
  // RLS already scopes enrollments to the signed-in student; the explicit
  // filter just keeps the query cheap if that policy ever widens.
  const userId = session.user?.id ? `&user_id=eq.${safeId(session.user.id)}` : "";
  const enrollments = await rest(`enrollments?select=course_id${userId}&limit=200`);
  for (const row of enrollments) if (row.course_id != null) ids.add(String(row.course_id));
  const free = await rest(`courses?select=id&or=(price.is.null,price.eq.0)&limit=200`);
  for (const row of free) if (row.id != null) ids.add(String(row.id));
  return [...ids].map(safeId);
}

const openable = await openableCourseIds();

if (openable.length > 0) {
  const configuredSet = new Set(courseIds.map((id) => String(id)));
  // Configured courses first so a fixture in E2E_COURSE_ID always wins.
  const searchOrder = [
    ...openable.filter((id) => configuredSet.has(id)),
    ...openable.filter((id) => !configuredSet.has(id)),
  ];
  const inList = `in.(${searchOrder.join(",")})`;

  // --- E2E_QUIZ_ID -----------------------------------------------------------
  const configuredQuiz = process.env.E2E_QUIZ_ID?.trim();
  let quizId = null;
  if (configuredQuiz) {
    const visible = await rest(
      `quizzes?select=id&id=eq.${safeId(configuredQuiz)}&is_published=eq.true&course_id=${inList}&limit=1`,
    );
    if (visible.length > 0 && (await quizHasQuestions(configuredQuiz))) {
      quizId = configuredQuiz;
    } else {
      console.log(`::notice::E2E_QUIZ_ID secret is not attemptable by the E2E student (unpublished, course not openable, or no questions) — looking for another quiz.`);
    }
  }
  if (!quizId) {
    const candidates = await rest(
      `quizzes?select=id,title,course_id&is_published=eq.true&course_id=${inList}&order=created_at.desc&limit=40`,
    );
    // Keep the configured-course-first ordering PostgREST cannot express.
    const rank = new Map(searchOrder.map((id, i) => [id, i]));
    candidates.sort((a, b) => (rank.get(String(a.course_id)) ?? 1e9) - (rank.get(String(b.course_id)) ?? 1e9));
    for (const q of candidates) {
      if (await quizHasQuestions(q.id)) {
        quizId = q.id;
        console.log(`::notice::E2E_QUIZ_ID resolved to "${q.title}" (${q.id}, course ${q.course_id}).`);
        break;
      }
    }
  }
  if (quizId) resolved.E2E_QUIZ_ID_RESOLVED = quizId;
  else console.log(`::notice::No attemptable quiz with questions in ${searchOrder.length} openable course(s) — quiz spec will skip. Publish a quiz with questions in E2E_COURSE_ID to enable it.`);

  // --- E2E_LESSON_ID (lesson with a *visible* image comment) ------------------
  // The app renders comments through useComments.ts: is_hidden = false, newest
  // first, capped at 100 per lesson. A fixture that ignores those rules points
  // the spec at an image the UI never draws. Locked lessons are skipped too —
  // the deep link would land on the paywall.
  const configuredLesson = process.env.E2E_LESSON_ID?.trim();
  let lesson = null; // { id, course_id }
  if (configuredLesson) {
    if (await imageCommentIsVisible(safeId(configuredLesson))) {
      const meta = await rest(
        `lessons?select=id,course_id&id=eq.${safeId(configuredLesson)}&${UNLOCKED}&limit=1`,
      );
      if (meta.length > 0 && searchOrder.includes(String(meta[0].course_id))) lesson = meta[0];
    }
  }
  if (!lesson) {
    // Comments RLS is per-lesson; walk openable courses in priority order and
    // stop at the first lesson that has an image comment.
    for (const courseId of searchOrder) {
      const lessons = await rest(
        `lessons?select=id&course_id=eq.${courseId}&${UNLOCKED}&order=position.asc&limit=200`,
      );
      if (lessons.length === 0) continue;
      const ids = lessons.map((l) => safeId(l.id)).join(",");
      const rows = await rest(
        `comments?select=lesson_id&lesson_id=in.(${ids})&is_hidden=eq.false&image_url=not.is.null&order=created_at.desc&limit=20`,
      );
      let picked = null;
      for (const row of rows) {
        if (await imageCommentIsVisible(safeId(row.lesson_id))) { picked = row.lesson_id; break; }
      }
      if (picked) {
        lesson = { id: picked, course_id: courseId };
        console.log(`::notice::E2E_LESSON_ID resolved to ${lesson.id} in course ${courseId} (visible image comment).`);
        break;
      }
    }
  }
  if (lesson) {
    resolved.E2E_LESSON_ID_RESOLVED = lesson.id;
    resolved.E2E_LESSON_COURSE_ID_RESOLVED = String(lesson.course_id);
  } else {
    console.log(`::notice::No lesson with an image comment in ${searchOrder.length} openable course(s) — comment-image spec will skip. Post one comment with an image in E2E_COURSE_ID to enable it.`);
  }
}

if (process.env.GITHUB_ENV && Object.keys(resolved).length > 0) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_ENV,
    Object.entries(resolved).map(([k, v]) => `${k}=${v}\n`).join(""),
  );
}
console.log(`Fixture discovery: ${Object.keys(resolved).join(", ") || "nothing resolved"}.`);

// Release the probe session without touching other suites' tokens on the same
// account: scope=local revokes this JWT only (a global logout used to sign the
// Maestro run out mid-flight).
await fetch(`${baseUrl}/auth/v1/logout?scope=local`, {
  method: "POST",
  headers: { apikey: apiKey, Authorization: `Bearer ${session.access_token}` },
}).catch(() => {});
