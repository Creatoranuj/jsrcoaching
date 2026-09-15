/**
 * Single accessor for a lesson's document source.
 *
 * AUDIT 2026-09-08: PDF links lived in five competing places — video_url (all 6
 * Knowledge Hub PDFs), class_pdf_url, file_path, lesson_pdfs.file_url and
 * lesson_attachments — so every screen guessed differently. The database now
 * carries canonical `asset_url` / `asset_kind` columns (backfilled from all
 * five). Read through this helper: it prefers the canonical column and falls
 * back to the legacy fields while the old data is still around.
 */
export type LessonAssetRow = {
  asset_url?: string | null;
  asset_kind?: string | null;
  class_pdf_url?: string | null;
  file_path?: string | null;
  video_url?: string | null;
  lecture_type?: string | null;
};

const DOC_URL_RE =
  /\.pdf(?:[?#]|$)|drive\.google\.com|docs\.google\.com|archive\.org|notion\.(so|site|com)|cdn\.jsdelivr\.net/i;

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function lessonAssetUrl(lesson: LessonAssetRow, fallbackPdfUrl?: string | null): string | null {
  const legacyVideoAsDoc =
    ["PDF", "DPP", "NOTES"].includes((lesson.lecture_type ?? "").toUpperCase()) ||
    DOC_URL_RE.test(lesson.video_url ?? "")
      ? clean(lesson.video_url)
      : null;

  return (
    clean(lesson.asset_url) ??
    clean(lesson.class_pdf_url) ??
    clean(fallbackPdfUrl) ??
    clean(lesson.file_path) ??
    legacyVideoAsDoc
  );
}

export function lessonAssetKind(lesson: LessonAssetRow, url?: string | null): string | null {
  if (clean(lesson.asset_kind)) return lesson.asset_kind!.trim();
  const target = url ?? lessonAssetUrl(lesson);
  if (!target) return null;
  if (/cdn\.jsdelivr\.net|raw\.githubusercontent\.com/i.test(target)) return "jsdelivr";
  if (/docs\.google\.com\/spreadsheets/i.test(target)) return "sheets";
  if (/drive\.google\.com|docs\.google\.com/i.test(target)) return "drive";
  if (/archive\.org/i.test(target)) return "archive";
  if (/notion\.(so|site|com)|notion-static\.com|prod-files-secure/i.test(target)) return "notion";
  if (/^storage:\/\/|supabase\.co\/storage\//i.test(target)) return "storage";
  return "other";
}
