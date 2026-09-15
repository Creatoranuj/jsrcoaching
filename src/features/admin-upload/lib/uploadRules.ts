/**
 * Pure upload rules extracted from AdminUpload.tsx.
 *
 * Same constants, same messages, same path shapes as before — only testable now.
 */

export const BLOCKED_EXTS = [
  "exe", "html", "htm", "js", "php", "sh", "bat", "cmd", "vbs",
  "py", "rb", "mjs", "ts", "tsx", "json", "xml", "svg",
];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska",
  "application/octet-stream",
];

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
/** Signed-URL lifetime for private course videos: one year, in seconds. */
export const VIDEO_SIGNED_URL_TTL = 365 * 24 * 3600;

export type FileCheck = { ok: true; error?: never } | { ok: false; error: string };

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

/** Extension blocklist + MIME allowlist. Empty MIME (some browsers) is tolerated. */
export function checkUploadFile(file: { name: string; type: string }): FileCheck {
  const ext = fileExtension(file.name);
  if (BLOCKED_EXTS.includes(ext)) {
    return { ok: false, error: `File type ".${ext}" is not allowed for security reasons` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type) && file.type !== "") {
    return {
      ok: false,
      error: `File type "${file.type}" is not allowed. Use PDF, Office docs, images, or video.`,
    };
  }
  return { ok: true };
}

export function checkThumbnailFile(file: { type: string; size: number }): FileCheck {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: "Only image files (JPG, PNG, GIF, WebP) allowed" };
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return { ok: false, error: "Thumbnail must be under 10MB" };
  }
  return { ok: true };
}

export function checkVideoFile(file: { size: number }): FileCheck {
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: "Video file must be under 500MB" };
  }
  return { ok: true };
}

/** `<timestamp>_<random>.<ext>` — collision-safe object name, extension preserved. */
export function randomObjectName(originalName: string): string {
  const ext = originalName.split(".").pop();
  return `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
}

/** Videos are namespaced per course so bucket policies can scope by prefix. */
export function videoStoragePath(courseId: number | null, objectName: string): string {
  const coursePrefix = courseId ? `course-${courseId}` : "uploads";
  return `${coursePrefix}/uploads/${objectName}`;
}

/** Bucket-agnostic URI stored in the DB; resolver signs it on read. */
export function storageUri(bucket: string, path: string): string {
  return `storage://${bucket}/${path}`;
}

/** New items append to the end of an ordered list (1-based positions). */
export function nextPosition(explicit: number | undefined | null, currentCount: number): number {
  return explicit || currentCount + 1;
}

// ── Upload type presentation rules ───────────────────────────────────────────
// Moved out of AdminUpload.tsx so the label/colour/icon mapping is testable.

export type UploadTypeId = "VIDEO" | "LIVE" | "PDF" | "DPP" | "DPP_ATTEMPT" | "NOTES" | "TEST";

export const UPLOAD_TYPES: UploadTypeId[] = [
  "VIDEO", "LIVE", "PDF", "DPP", "DPP_ATTEMPT", "NOTES", "TEST",
];

const UPLOAD_TYPE_LABELS: Record<UploadTypeId, string> = {
  VIDEO: "Lecture",
  LIVE: "Live Class",
  PDF: "PDF",
  DPP: "DPP",
  DPP_ATTEMPT: "DPP Attempt",
  NOTES: "Notes",
  TEST: "Test",
};

export function uploadTypeLabel(type: string): string {
  return UPLOAD_TYPE_LABELS[type as UploadTypeId] ?? type;
}

/** Which icon a type renders: video camera, clipboard, or document. */
export function uploadTypeIcon(type: string): "video" | "test" | "document" {
  if (type === "VIDEO" || type === "LIVE") return "video";
  if (type === "TEST") return "test";
  return "document";
}

export function uploadTypeColor(type: string): string {
  switch (type) {
    case "VIDEO": return "bg-blue-100 text-blue-600";
    case "LIVE": return "bg-red-100 text-red-600";
    case "PDF": return "bg-orange-100 text-orange-600";
    case "DPP": return "bg-green-100 text-green-600";
    case "DPP_ATTEMPT": return "bg-emerald-100 text-emerald-700";
    case "NOTES": return "bg-purple-100 text-purple-600";
    case "TEST": return "bg-red-100 text-red-600";
    default: return "bg-muted text-muted-foreground";
  }
}

export interface BreadcrumbSegment { label: string; clickable: boolean }

/** Upload Center > Course > Chapter, with only ancestors clickable. */
export function buildUploadBreadcrumb(
  courseTitle?: string | null,
  chapterTitle?: string | null,
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [
    { label: "Upload Center", clickable: !!courseTitle },
  ];
  if (courseTitle) segments.push({ label: courseTitle, clickable: !!chapterTitle });
  if (chapterTitle) segments.push({ label: chapterTitle, clickable: false });
  return segments;
}
