/**
 * Fetch all notes/attachments for a lesson, persist them to the device
 * (app-private storage on native, blob download on web) AND index them in
 * IndexedDB so they appear on the /downloads page and are usable offline.
 *
 * Bug fixed: previously called downloadFile() which on native wrote to
 * Directory.ExternalStorage/Download/ (requires legacy WRITE_EXTERNAL_STORAGE
 * permission and is invisible to the app afterwards). The toast said
 * "saved" but the file never appeared in Downloads. We now route through
 * saveAndIndexDownload() which is the same pipeline /downloads uses.
 */
import { supabase } from "@/integrations/supabase/client";
import { saveAndIndexDownload } from "@/services/savedDownloads";
import type { DownloadRecord } from "@/lib/indexedDB";

const ATTACHMENT_BUCKET = "lesson-attachments";

function isNativeApp(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

export interface DownloadLessonResult {
  total: number;
  saved: number;
  failed: number;
}

type Source = "class_pdf" | "lesson_pdf" | "attachment";

function fileTypeFor(name: string, source: Source): DownloadRecord["fileType"] {
  const lower = (name || "").toLowerCase();
  // Detect by extension first so .md / .docx / .xlsx attachments don't get
  // mis-routed to the PDF reader (which would just show a blank page).
  if (/\.(md|markdown)(\?|$)/.test(lower)) return "MD";
  if (/\.(docx?|pptx?|xlsx?|csv)(\?|$)/.test(lower)) return "OFFICE";
  if (/\.(png|jpe?g|webp|gif|svg|heic)(\?|$)/.test(lower)) return "IMAGE";
  if (source === "lesson_pdf" || /\.pdf(\?|$)/.test(lower)) return "PDF";
  if (/dpp/i.test(lower)) return "DPP";
  return "NOTES";
}

async function resolveUrl(file_url: string, source: Source): Promise<string | null> {
  if (!file_url) return null;
  // `lecture-pdfs` is a private bucket — sign whether the row stores the
  // legacy public URL or the new `storage://` URI. Must run BEFORE the
  // generic `startsWith("http")` shortcut below.
  const { extractLecturePdfPath } = await import("../lib/resolveLecturePdfUrl");
  const lecturePath = extractLecturePdfPath(file_url);
  if (lecturePath) {
    const { data, error } = await supabase.storage
      .from("lecture-pdfs")
      .createSignedUrl(lecturePath, 60 * 60);
    if (error) return null;
    return data.signedUrl;
  }
  // `content` bucket gated folders — sign via helper.
  const { extractContentPath, resolveContentUrl } = await import("../lib/resolveContentUrl");
  if (extractContentPath(file_url)) {
    const resolved = await resolveContentUrl(file_url);
    if (resolved) return resolved;
  }
  if (file_url.startsWith("http")) return file_url;
  if (source === "attachment") {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(file_url, 60 * 60);
    if (error) return null;
    return data.signedUrl;
  }
  return file_url;
}

export async function downloadAllLessonNotes(lessonId: string): Promise<DownloadLessonResult> {
  const [lessonRes, pdfsRes, attRes] = await Promise.all([
    supabase.from("lessons").select("id, class_pdf_url, title").eq("id", lessonId).maybeSingle(),
    supabase.from("lesson_pdfs").select("file_url, file_name").eq("lesson_id", lessonId),
    supabase.from("lesson_attachments").select("file_url, file_name").eq("lesson_id", lessonId),
  ]);

  const jobs: Array<{ url: string; name: string; title: string; source: Source }> = [];
  const seen = new Set<string>();
  const lessonRow = lessonRes.data as { id: string; class_pdf_url: string | null; title: string | null } | null;
  const lessonTitle = lessonRow?.title || "Lesson";

  if (lessonRow?.class_pdf_url) {
    seen.add(lessonRow.class_pdf_url);
    const name = lessonRow.class_pdf_url.split("/").pop()?.split("?")[0] || "Class PDF.pdf";
    jobs.push({ url: lessonRow.class_pdf_url, name, title: `${lessonTitle} — Class PDF`, source: "class_pdf" });
  }
  (pdfsRes.data as Array<{ file_url: string; file_name: string }> | null)?.forEach((p) => {
    if (seen.has(p.file_url)) return;
    seen.add(p.file_url);
    const name = p.file_name || "lesson.pdf";
    jobs.push({ url: p.file_url, name, title: name.replace(/\.[^.]+$/, ""), source: "lesson_pdf" });
  });
  (attRes.data as Array<{ file_url: string; file_name: string }> | null)?.forEach((a) => {
    if (seen.has(a.file_url)) return;
    seen.add(a.file_url);
    const name = a.file_name || "attachment";
    jobs.push({ url: a.file_url, name, title: name.replace(/\.[^.]+$/, ""), source: "attachment" });
  });

  let saved = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const resolved = await resolveUrl(job.url, job.source);
      if (!resolved) { failed++; continue; }
      const result = await saveAndIndexDownload({
        title: job.title,
        url: resolved,
        filename: job.name,
        fileType: fileTypeFor(job.name, job.source),
      });
      if (isNativeApp() && !result.nativeSaved) { failed++; continue; }
      saved++;
    } catch (err) {
      console.warn("[downloadLessonNotes] failed", job.name, err);
      failed++;
    }
  }
  return { total: jobs.length, saved, failed };
}
