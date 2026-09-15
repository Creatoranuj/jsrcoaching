// Single source of truth for Android back-button navigation targets.
// Used by `useAndroidBackButton`. Add new routes here, not inline in the hook.

// NOTE: `/` is intentionally NOT an exit route. Authenticated users get
// redirected away from `/` to `/dashboard` immediately, which would flip
// `latest.path` before the 2-second double-tap window can register and
// break the exit gesture. Only `/dashboard` is a stable exit anchor.
// Routes from which the hardware back button should exit/minimize the app
// (with a 2-second double-tap confirmation). Add stable home anchors here.
// `/` and `/index` are included because unauthenticated users land there
// and pressing back must minimize the app — not bounce them through
// history forever.
export const EXIT_ROUTES = ["/dashboard", "/", "/index", "/admin"] as const;
export const AUTH_ROUTES = ["/login", "/signup", "/admin/login", "/admin/register"] as const;

/**
 * Static path → parent route. Back press on key returns to value.
 */
export const STATIC_PARENT_MAP: Record<string, string> = {
  "/downloads": "/dashboard",
  "/settings": "/dashboard",
  "/profile": "/dashboard",
  "/notices": "/dashboard",
  "/materials": "/dashboard",
  "/timetable": "/dashboard",
  "/books": "/dashboard",
  "/doubts": "/dashboard",
  // NOTE: `/install` is intentionally NOT mapped — it's a PUBLIC route, so
  // sending guests to `/dashboard` triggers ProtectedRoute → /login bounce.
  // Fallback (step 6 in useAndroidBackButton) handles it correctly.
  "/help": "/dashboard",
  "/about": "/dashboard",
  "/contact": "/dashboard",
  "/courses": "/dashboard",
  "/my-courses": "/dashboard",
  "/all-classes": "/dashboard",
  "/all-tests": "/dashboard",
  "/attendance": "/dashboard",
  "/reports": "/dashboard",
  "/library": "/dashboard",
  "/community": "/dashboard",
  "/syllabus": "/dashboard",
  "/messages": "/dashboard",
  "/students": "/dashboard",
  "/subscription": "/dashboard",
};

/**
 * Some routes cannot be restored by a bare `history.back()` because their
 * PARENT keeps its drill-down position in component state, not the URL. The
 * my-courses flow drills subject → chapter → lessons list ALL in-page inside
 * `MyCourseDetail` (every step stays on `/my-courses/:id`), then opens the
 * player on the separate `/classes/:id/lessons` route. A bare `history.back()`
 * from the player lands on the bare `/my-courses/:id` entry and loses the
 * drill position — the user gets dumped at the subject root instead of the
 * lesson list they came from. For these routes we build an explicit restore
 * URL from the lesson's own `chapter`/`path` params so `MyCourseDetail`'s
 * restore effect rebuilds the exact view. Returns null for every route that
 * restores fine through the normal navigation trail.
 */
export function resolveRestoreTarget(path: string, search: URLSearchParams): string | null {
  const m = path.match(/^\/classes\/(\d+)\/lessons/);
  if (!m) return null;
  if (search.get("from") !== "my-courses") return null;
  const qs = new URLSearchParams();
  const chapter = search.get("chapter");
  const pathParam = search.get("path");
  if (chapter) qs.set("chapter", chapter);
  if (pathParam) qs.set("path", pathParam);
  const s = qs.toString();
  return `/my-courses/${m[1]}${s ? `?${s}` : ""}`;
}

/**
 * Prefix-match parents for dynamic routes. Evaluated in order; first match wins.
 * Each rule returns the destination path (or null to skip).
 */
export const PREFIX_PARENT_RULES: Array<{
  test: (path: string, search: URLSearchParams) => string | null;
}> = [
  {
    test: (path, search) => {
      const m = path.match(/^\/classes\/(\d+)\/lessons/);
      if (!m) return null;
      const from = search.get("from");
      const chapter = search.get("chapter");
      // my-courses drills IN-PAGE inside MyCourseDetail (see
      // resolveRestoreTarget) — return there with the drill state restored,
      // NOT to the /classes/:id/chapter route (which is a different page).
      if (from === "my-courses") {
        const restore = resolveRestoreTarget(path, search);
        if (restore) return restore;
      }
      // Audit fix (Batch): if the lesson URL knows its source chapter,
      // back MUST return to that chapter's LectureListing (the cards
      // page the user just came from). Previously we jumped straight
      // to the course/subject root, which felt like a "chapter cut"
      // — user lost their place inside the subject.
      if (chapter) {
        const qs = from ? `?from=${from}` : "";
        return `/classes/${m[1]}/chapter/${chapter}${qs}`;
      }
      if (from === "all-classes") return "/all-classes";
      if (from === "courses") return `/course/${m[1]}`;
      return `/classes/${m[1]}/chapters${from ? `?from=${from}` : ""}`;
    },
  },
  {
    // Chapter detail → chapter list, preserving `?from=` so the next back
    // hop resolves the correct course root (my-courses vs all-classes vs
    // courses). Falls back to sessionStorage via recallFromParam.
    test: (p, search) => {
      const m = p.match(/^\/classes\/(\d+)\/chapter\//);
      if (!m) return null;
      const from = search.get("from") || recallFromParam(m[1]);
      return `/classes/${m[1]}/chapters${from ? `?from=${from}` : ""}`;
    },
  },
  {
    // Chapter list → course root based on `?from=` (or recalled value).
    test: (p, search) => {
      const m = p.match(/^\/classes\/(\d+)\/chapters/);
      if (!m) return null;
      const from = search.get("from") || recallFromParam(m[1]);
      if (from === "my-courses") return `/my-courses/${m[1]}`;
      if (from === "courses") return `/course/${m[1]}`;
      return "/all-classes";
    },
  },
  { test: (p) => (p.match(/^\/course\/(\d+)/) ? "/courses" : null) },
  { test: (p) => (p.match(/^\/my-courses\/(.+)/) ? "/my-courses" : null) },
  { test: (p) => (p.startsWith("/buy-course") ? "/courses" : null) },
  { test: (p) => (p.startsWith("/quiz/") && p.includes("/result/") ? "/all-tests" : null) },
];

export function resolveBackTarget(path: string, search: URLSearchParams): string | null {
  for (const rule of PREFIX_PARENT_RULES) {
    const dest = rule.test(path, search);
    if (dest) return dest;
  }
  return STATIC_PARENT_MAP[path] ?? null;
}

/**
 * Single source of truth for the root breadcrumb segment on `/classes/...`
 * and `/course/...` pages. Mirrors `PREFIX_PARENT_RULES` so the breadcrumb
 * root agrees with the hardware back-button target. Defaults to `/all-classes`
 * (matches the back-button rule for `/classes/:id/chapters`).
 */
export function resolveCourseRoot(
  fromParam: string | null | undefined,
): { label: string; href: string } {
  switch (fromParam) {
    case "courses":
      return { label: "Courses", href: "/courses" };
    case "my-courses":
      return { label: "My Courses", href: "/my-courses" };
    case "all-classes":
      return { label: "All Classes", href: "/all-classes" };
    default:
      return { label: "All Classes", href: "/all-classes" };
  }
}

/**
 * Persist the `?from=` value per courseId so that a hard refresh or popstate
 * (which can drop the query string in some browsers) still resolves the
 * correct course root. Survives within the tab/session only.
 */
const FROM_KEY = (courseId: string | number) => `nb:from:${courseId}`;

export function rememberFromParam(courseId: string | number | null | undefined, fromParam: string | null | undefined): void {
  if (!courseId || !fromParam || typeof window === "undefined") return;
  try { window.sessionStorage.setItem(FROM_KEY(courseId), fromParam); } catch {}
}

export function recallFromParam(courseId: string | number | null | undefined): string | null {
  if (!courseId || typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(FROM_KEY(courseId)); } catch { return null; }
}

/**
 * Reads `from` from URL first, falls back to sessionStorage, then null.
 * Use in pages that need a stable root across refresh / popstate.
 */
export function resolveFromParam(
  search: URLSearchParams,
  courseId: string | number | null | undefined,
): string | null {
  const fromUrl = search.get("from");
  if (fromUrl) {
    rememberFromParam(courseId, fromUrl);
    return fromUrl;
  }
  return recallFromParam(courseId);
}
