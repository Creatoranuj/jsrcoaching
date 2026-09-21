/**
 * One place that says "this student's enrollments just changed".
 *
 * The browser-UPI path already refreshed the list the moment the server
 * confirmed an enrollment (`reconcileEnrollment.ts`), which is why My Courses
 * felt instant there. The in-app checkout did not, so three stale caches could
 * still hide a course the student had just paid for:
 *
 *   1. `useEnrollments` shared 60 s cache
 *   2. My Courses 24 h device snapshot (`nb_mycourses_v1_<uid>`)
 *   3. MyCourseDetail chapter bundle, which carries `hasPurchased: false`
 *
 * This grants nothing — it only drops caches so the next read hits the server.
 */
import { invalidateEnrollmentsCache } from "@/hooks/useEnrollments";
import { safeRemove } from "@/lib/storage";
import { clearBundle } from "@/lib/perf/chapterBundleCache";

export const MYCOURSES_CACHE_PREFIX = "nb_mycourses_v1_";

export function markEnrollmentChanged(
  courseId?: number | string | null,
  userId?: string | null,
): void {
  invalidateEnrollmentsCache();
  if (userId) safeRemove(`${MYCOURSES_CACHE_PREFIX}${userId}`);
  if (courseId !== undefined && courseId !== null && courseId !== "") {
    void clearBundle(courseId);
  }
}
