// Route allowlist for the JSR Agent (ChatWidget) FAB.
//
// Kept in its own tiny module so App.tsx can decide *whether* to mount the
// widget without statically importing ChatWidget.tsx itself. Previously
// App.tsx did both `lazyWithRetry(() => import("./ChatWidget"))` AND
// `import { isPathAllowed } from "./ChatWidget"`, which pulled the whole
// widget (react-markdown, remark-gfm, sonner, supabase client, etc.) into
// the main graph and produced Rollup's INEFFECTIVE_DYNAMIC_IMPORT warning —
// the lazy chunk was never actually split.
//
// Reader-heavy routes are explicitly blocked so the FAB never stacks on top
// of the Autoscroll FAB or the video/pdf reader chrome.
const ALLOWED_ROUTES = [
  "/",
  "/dashboard",
  "/courses",
  "/my-courses",
  "/all-classes",
  "/all-tests",
  "/materials",
  "/notices",
  "/books",
  "/doubts",
  "/timetable",
  "/syllabus",
  "/up-board-english",
  "/cbse-english",
  "/cg-lecturer-english",
];
const BLOCKED_PREFIXES = ["/lesson", "/quiz", "/live", "/exam", "/attempt", "/reader"];

// Exact-prefix blocks: hide the FAB on these routes but keep the parent
// route allowed. `/my-courses` (the list) still shows the FAB; the per-
// course Subjects page `/my-courses/:courseId` hides it per user request —
// the JSR Agent icon overlapped the Subject rows on mobile.
const BLOCKED_SUBPATH_PREFIXES = ["/my-courses/"];

export const isPathAllowed = (path: string): boolean => {
  if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) return false;
  if (BLOCKED_SUBPATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  return ALLOWED_ROUTES.some((r) =>
    r === "/" ? path === "/" : path === r || path.startsWith(r + "/"),
  );
};

