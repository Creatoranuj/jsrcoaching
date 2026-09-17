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

const courseIds = [...new Set([
  process.env.E2E_COURSE_ID,
  process.env.E2E_PAID_COURSE_ID,
  process.env.TEST_PAID_COURSE_ID,
].filter(Boolean))];

if (courseIds.length > 0) {
  const safeCourseIds = courseIds.map((id) => String(id).replace(/[^a-zA-Z0-9_-]/g, ""));
  const coursesResponse = await fetch(
    `${baseUrl}/rest/v1/courses?select=id&id=in.(${safeCourseIds.join(",")})`,
    {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    },
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