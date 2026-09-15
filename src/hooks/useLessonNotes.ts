import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { isGoogleDocs, isGoogleDrive, isNotion } from "../lib/pdfViewerUrl";
import { resolveContentUrl, extractContentPath } from "../lib/resolveContentUrl";
import { resolveLecturePdfUrl, extractLecturePdfPath } from "../lib/resolveLecturePdfUrl";

export type LessonNoteSource = "class_pdf" | "lesson_pdf" | "attachment";

export interface LessonNote {
  id: string;
  lesson_id: string;
  title: string;
  file_name: string;
  /** Either a public URL or a storage path (for private attachments). */
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  kind: "pdf" | "doc" | "image" | "video" | "audio" | "other";
  source: LessonNoteSource;
  /** Private storage bucket name when source === "attachment". */
  bucket?: string;
}

const ATTACHMENT_BUCKET = "lesson-attachments";

// Module-level cache keyed by lessonId. Survives sheet close/open cycles so
// re-opening the same lesson's notes drawer is INSTANT (no re-fetch flash).
// The fetch still runs in the background on re-open to revalidate, but the
// UI paints cached rows on the first frame — killing the "second-open lag".
// Kept small on purpose (LRU-ish trim at 32 entries) so we don't grow the
// heap over a long session with lots of lesson jumps.
const notesCache = new Map<string, LessonNote[]>();
const CACHE_MAX = 32;
function cachePut(id: string, rows: LessonNote[]) {
  if (notesCache.has(id)) notesCache.delete(id);
  notesCache.set(id, rows);
  while (notesCache.size > CACHE_MAX) {
    const firstKey = notesCache.keys().next().value;
    if (firstKey === undefined) break;
    notesCache.delete(firstKey);
  }
}

function inferKindFromName(name: string, url = ""): LessonNote["kind"] {
  if (isNotion(url) || isGoogleDrive(url) || isGoogleDocs(url)) return "pdf";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf"].includes(ext)) return "doc";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio";
  return "other";
}

/**
 * Unified "notes" reader for a lesson.
 * Merges: lessons.class_pdf_url + lesson_pdfs + lesson_attachments
 * De-duplicated by (file_url) so the primary class PDF isn't listed twice
 * (the auto-link in lesson_pdfs uses the same URL).
 */
export const useLessonNotes = (lessonId?: string) => {
  // Seed synchronously from the module cache so re-opens paint instantly.
  const seed = lessonId ? notesCache.get(lessonId) : undefined;
  const [notes, setNotes] = useState<LessonNote[]>(seed ?? []);
  // loading=true only when we have NO cached rows for this lessonId — a warm
  // cache renders instantly and revalidates silently in the background.
  const [loading, setLoading] = useState(!!lessonId && !seed);

  // Derived-state guard: when `lessonId` transitions, prefer cached rows if
  // present, otherwise clear + show loading. Runs during render so consumers
  // never see a stale frame (previous lesson's rows or an empty state for a
  // lesson whose data isn't loaded yet).
  const prevIdRef = useRef<string | undefined>(lessonId);
  if (prevIdRef.current !== lessonId) {
    prevIdRef.current = lessonId;
    if (lessonId) {
      const cached = notesCache.get(lessonId);
      if (cached) {
        setNotes(cached);
        if (loading) setLoading(false);
      } else {
        if (!loading) setLoading(true);
        if (notes.length) setNotes([]);
      }
    } else {
      if (loading) setLoading(false);
      if (notes.length) setNotes([]);
    }
  }

  const fetchNotes = useCallback(async () => {
    if (!lessonId) { setNotes([]); return; }
    // Only flip loading=true on a cold fetch. A warm cache re-fetch stays
    // silent so the cached rows keep painting while we revalidate.
    if (!notesCache.has(lessonId)) setLoading(true);
    try {
      const [lessonRes, pdfsRes, attRes] = await Promise.all([
        supabase.from("lessons").select("id, title, class_pdf_url, video_url, lecture_type").eq("id", lessonId).maybeSingle(),
        supabase.from("lesson_pdfs").select("id,lesson_id,file_name,file_url,file_size,position,skill_level,subject,version,created_at").eq("lesson_id", lessonId).order("position", { ascending: true }),
        supabase.from("lesson_attachments").select("id,lesson_id,title,file_url,file_name,file_size,mime_type,kind,position,created_at").eq("lesson_id", lessonId).order("position", { ascending: true }),
      ]);

      const merged: LessonNote[] = [];
      const seenUrls = new Set<string>();

      const lessonRow = lessonRes.data as { id: string; title: string; class_pdf_url: string | null; video_url: string | null; lecture_type: string | null } | null;
      // For standalone PDF / NOTES / DPP lessons the uploaded file is stored
      // in `video_url` (single-upload path). Surface it as the first note so
      // the attachments drawer isn't empty for these lesson types.
      const lt = (lessonRow?.lecture_type || "").toUpperCase();
      const decodeName = (n: string): string => {
        try { return /%[0-9A-Fa-f]{2}/.test(n) ? decodeURIComponent(n) : n; } catch { return n; }
      };
      if (lessonRow?.video_url && (lt === "PDF" || lt === "NOTES" || lt === "DPP")) {
        const url = lessonRow.video_url;
        const raw = url.split("/").pop()?.split("?")[0] || `${lessonRow.title || "Document"}.pdf`;
        const name = decodeName(raw);
        const label = lt === "DPP" ? "DPP" : lt === "NOTES" ? "Notes" : "PDF";
        merged.push({
          id: `lesson-file-${lessonRow.id}`,
          lesson_id: lessonRow.id,
          title: lessonRow.title || label,
          file_name: name,
          file_url: url,
          file_size: null,
          mime_type: "application/pdf",
          kind: "pdf",
          source: "lesson_pdf",
        });
        seenUrls.add(url);
      }
      if (lessonRow?.class_pdf_url) {
        const url = lessonRow.class_pdf_url;
        if (seenUrls.has(url)) {
          // already surfaced via video_url — skip duplicate
        } else {
        const raw = url.split("/").pop()?.split("?")[0] || "Class PDF.pdf";
        const name = decodeName(raw);
        merged.push({
          id: `class-${lessonRow.id}`,
          lesson_id: lessonRow.id,
          title: "Class PDF",
          file_name: name,
          file_url: url,
          file_size: null,
          mime_type: "application/pdf",
          kind: "pdf",
          source: "class_pdf",
        });
        seenUrls.add(url);
        }
      }


      (pdfsRes.data || []).forEach((p) => {
        if (seenUrls.has(p.file_url)) return;
        seenUrls.add(p.file_url);
        merged.push({
          id: p.id,
          lesson_id: p.lesson_id,
          title: p.file_name || "PDF",
          file_name: p.file_name,
          file_url: p.file_url,
          file_size: p.file_size ?? null,
          mime_type: "application/pdf",
          kind: "pdf",
          source: "lesson_pdf",
        });
      });

      (attRes.data || []).forEach((a) => {
        if (seenUrls.has(a.file_url)) return;
        seenUrls.add(a.file_url);
        merged.push({
          id: a.id,
          lesson_id: a.lesson_id,
          title: a.title || a.file_name,
          file_name: a.file_name,
          file_url: a.file_url,
          file_size: a.file_size ?? null,
          mime_type: a.mime_type ?? null,
          kind: isNotion(a.file_url) || isGoogleDrive(a.file_url) || isGoogleDocs(a.file_url)
            ? "pdf"
            : ((a.kind as LessonNote["kind"]) === "other" ? inferKindFromName(a.file_name, a.file_url) : ((a.kind as LessonNote["kind"]) || inferKindFromName(a.file_name, a.file_url))),
          source: "attachment",
          bucket: ATTACHMENT_BUCKET,
        });
      });

      setNotes(merged);
      cachePut(lessonId, merged);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  /** Resolve a usable URL — signs private attachment paths and gated `content` bucket URLs on demand. */
  const getResolvedUrl = useCallback(async (note: LessonNote): Promise<string | null> => {
    // Attachments in a private per-user bucket (path stored raw).
    if (note.source === "attachment" && note.bucket && !note.file_url.startsWith("http") && !note.file_url.startsWith("storage://")) {
      const { data, error } = await supabase.storage
        .from(note.bucket)
        .createSignedUrl(note.file_url, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    }
    // `content` bucket URL (legacy public or new storage://) — resolve via helper.
    if (extractContentPath(note.file_url)) {
      const resolved = await resolveContentUrl(note.file_url);
      if (resolved) return resolved;
    }
    // `lecture-pdfs` bucket URL — resolve via helper.
    if (extractLecturePdfPath(note.file_url)) {
      const resolvedLecture = await resolveLecturePdfUrl(note.file_url);
      if (resolvedLecture) return resolvedLecture;
    }
    return note.file_url;
  }, []);

  return { notes, loading, fetchNotes, getResolvedUrl };
};
