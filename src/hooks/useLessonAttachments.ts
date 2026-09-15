import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { isGoogleDocs, isGoogleDrive, isNotion } from "@/lib/pdfViewerUrl";
import { reportError } from "../lib/sentry";

export type LessonAttachmentKind = "pdf" | "doc" | "image" | "video" | "audio" | "other";

export interface LessonAttachment {
  id: string;
  lesson_id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  kind: LessonAttachmentKind;
  position: number;
  created_at: string;
  updated_at: string;
}

const BUCKET = "lesson-attachments";

function inferKind(mime: string | undefined, name: string, url = ""): LessonAttachmentKind {
  if (isNotion(url) || isGoogleDrive(url) || isGoogleDocs(url)) return "pdf";
  const lower = (mime || "").toLowerCase();
  if (lower.includes("pdf")) return "pdf";
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.includes("word") || lower.includes("officedocument") || lower.includes("msword")) return "doc";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf"].includes(ext)) return "doc";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio";
  return "other";
}

export const useLessonAttachments = (lessonId?: string) => {
  const [attachments, setAttachments] = useState<LessonAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  // RELY-cleanup: prevent setState after unmount on slow networks.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const fetchAttachments = useCallback(async () => {
    if (!lessonId) { if (aliveRef.current) setAttachments([]); return; }
    if (aliveRef.current) setLoading(true);
    const { data, error } = await supabase
      .from("lesson_attachments")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });
    if (error) reportError(error, { surface: "useLessonAttachments.fetch" });
    if (!aliveRef.current) return;
    setAttachments(((data as LessonAttachment[]) || []).map((att) => ({
      ...att,
      // Older external Notion/Drive/CDN rows were saved as `other`, so
      // AttachmentRow downloaded them instead of opening the inline reader.
      kind: att.kind === "other" ? inferKind(att.mime_type || undefined, att.file_name || att.title || "", att.file_url) : att.kind,
    })));
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  const addAttachment = useCallback(async (
    targetLessonId: string,
    file: File,
    title?: string
  ): Promise<LessonAttachment | null> => {
    try {
      const ext = file.name.split(".").pop();
      const path = `${targetLessonId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadErr) throw uploadErr;

      // Bucket is private — use signed URL valid 10 years (or a short-lived URL fetched on demand).
      // For simplicity store the storage path; UI will sign on demand.
      const fileUrl = path;

      const { data, error } = await supabase
        .from("lesson_attachments")
        .insert({
          lesson_id: targetLessonId,
          title: title || file.name,
          file_name: file.name,
          file_url: fileUrl,
          file_size: file.size,
          mime_type: file.type || null,
          kind: inferKind(file.type, file.name),
          position: attachments.length,
        })
        .select()
        .single();
      if (error) throw error;
      const created = data as LessonAttachment;
      setAttachments(prev => [...prev, created]);
      toast.success("Attachment uploaded");
      return created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Upload failed: " + msg);
      return null;
    }
  }, [attachments.length]);

  const deleteAttachment = useCallback(async (id: string) => {
    const att = attachments.find(a => a.id === id);
    if (!att) return;
    if (att.file_url && !att.file_url.startsWith("http")) {
      await supabase.storage.from(BUCKET).remove([att.file_url]);
    }
    const { error } = await supabase.from("lesson_attachments").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    setAttachments(prev => prev.filter(a => a.id !== id));
    toast.success("Attachment removed");
  }, [attachments]);

  /** Resolve a downloadable URL — signed if stored as a path. */
  const getSignedUrl = useCallback(async (att: LessonAttachment): Promise<string | null> => {
    if (att.file_url.startsWith("http")) return att.file_url;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.file_url, 60 * 60);
    if (error) {
      toast.error("Could not get file URL: " + error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return { attachments, loading, fetchAttachments, addAttachment, deleteAttachment, getSignedUrl };
};
