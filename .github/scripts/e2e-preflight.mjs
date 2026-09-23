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

if (courseIds.length > 0) {
  const safeCourseIds = courseIds.map(safeId);

  // --- E2E_QUIZ_ID -----------------------------------------------------------
  const configuredQuiz = process.env.E2E_QUIZ_ID?.trim();
  let quizId = null;
  if (configuredQuiz) {
    const visible = await rest(`quizzes?select=id&id=eq.${safeId(configuredQuiz)}&is_published=eq.true&limit=1`);
    if (visible.length > 0 && (await quizHasQuestions(configuredQuiz))) {
      quizId = configuredQuiz;
    } else {
      console.log(`::notice::E2E_QUIZ_ID secret is not attemptable by the E2E student (unpublished, wrong course, or no questions) — looking for another quiz.`);
    }
  }
  if (!quizId) {
    const candidates = await rest(
      `quizzes?select=id,title&is_published=eq.true&course_id=in.(${safeCourseIds.join(",")})&order=created_at.desc&limit=15`,
    );
    for (const q of candidates) {
      if (await quizHasQuestions(q.id)) {
        quizId = q.id;
        console.log(`::notice::E2E_QUIZ_ID resolved to "${q.title}" (${q.id}).`);
        break;
      }
    }
  }
  if (quizId) resolved.E2E_QUIZ_ID_RESOLVED = quizId;
  else console.log("::notice::No attemptable quiz with questions found in the configured courses — quiz spec will skip.");

  // --- E2E_LESSON_ID (lesson with an image comment) ---------------------------
  const courseForLesson = process.env.E2E_COURSE_ID?.trim();
  if (courseForLesson) {
    const configuredLesson = process.env.E2E_LESSON_ID?.trim();
    let lessonId = null;
    if (configuredLesson) {
      const rows = await rest(`comments?select=lesson_id&lesson_id=eq.${safeId(configuredLesson)}&image_url=not.is.null&limit=1`);
      if (rows.length > 0) lessonId = configuredLesson;
    }
    if (!lessonId) {
      const lessons = await rest(`lessons?select=id&course_id=eq.${safeId(courseForLesson)}&order=position.asc&limit=200`);
      if (lessons.length > 0) {
        const ids = lessons.map((l) => safeId(l.id)).join(",");
        const rows = await rest(
          `comments?select=lesson_id&lesson_id=in.(${ids})&image_url=not.is.null&order=created_at.desc&limit=1`,
        );
        if (rows.length > 0) {
          lessonId = rows[0].lesson_id;
          console.log(`::notice::E2E_LESSON_ID resolved to ${lessonId} (has an image comment).`);
        }
      }
    }
    if (lessonId) resolved.E2E_LESSON_ID_RESOLVED = lessonId;
    else console.log("::notice::No lesson with an image comment in E2E_COURSE_ID — comment-image spec will skip.");
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
