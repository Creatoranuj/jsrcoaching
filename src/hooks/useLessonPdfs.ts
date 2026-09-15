import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { resolveLecturePdfUrl, extractLecturePdfPath } from "../lib/resolveLecturePdfUrl";
import { reportError } from "../lib/sentry";
import { getErrorMessage } from "@/lib/errorMessage";

export interface LessonPdf {
  id: string;
  lesson_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  position: number;
  created_at: string;
}

export const useLessonPdfs = (lessonId?: string) => {
  const [pdfs, setPdfs] = useState<LessonPdf[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPdfs = useCallback(async () => {
    if (!lessonId) { setPdfs([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("lesson_pdfs")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });
    if (error) reportError(error, { surface: "useLessonPdfs.fetch" });
    // `lecture-pdfs` is a private bucket — the raw file_url (legacy public
    // URL or `storage://` URI) is not directly fetchable. Resolve each row
    // to a short-lived signed URL before handing to the reader. Non-bucket
    // URLs (Notion, Drive, external CDNs) pass through untouched.
    const rows = ((data as LessonPdf[]) || []);
    const signed = await Promise.all(rows.map(async (row) => {
      const resolved = await resolveLecturePdfUrl(row.file_url);
      return resolved ? { ...row, file_url: resolved } : row;
    }));
    setPdfs(signed);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { fetchPdfs(); }, [fetchPdfs]);

  const addPdf = useCallback(async (
    lessonId: string,
    file: File
  ): Promise<LessonPdf | null> => {
    try {
      const ext = file.name.split(".").pop();
      const path = `${lessonId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("lecture-pdfs")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      // Store the storage-scheme URI (not a permanent public URL) so RLS on
      // storage.objects always mediates access. The hook resolves it to a
      // signed URL on read.
      const storageUri = `storage://lecture-pdfs/${path}`;

      const { data, error } = await supabase
        .from("lesson_pdfs")
        .insert({
          lesson_id: lessonId,
          file_name: file.name,
          file_url: storageUri,
          file_size: file.size,
          position: pdfs.length,
        })
        .select()
        .single();
      if (error) throw error;
      const inserted = data as LessonPdf;
      // Immediately sign so the UI can open it right after upload.
      const signedUrl = await resolveLecturePdfUrl(inserted.file_url);
      const newPdf = signedUrl ? { ...inserted, file_url: signedUrl } : inserted;
      setPdfs(prev => [...prev, newPdf]);
      return newPdf;
    } catch (err: unknown) {
      toast.error("PDF upload nahi hua — file check karke dobara try karo");
      return null;
    }
  }, [pdfs.length]);

  const addPdfByUrl = useCallback(async (
    lessonId: string,
    fileName: string,
    fileUrl: string
  ): Promise<LessonPdf | null> => {
    try {
      const { data, error } = await supabase
        .from("lesson_pdfs")
        .insert({
          lesson_id: lessonId,
          file_name: fileName,
          file_url: fileUrl,
          position: pdfs.length,
        })
        .select()
        .single();
      if (error) throw error;
      const newPdf = data as LessonPdf;
      setPdfs(prev => [...prev, newPdf]);
      return newPdf;
    } catch (err: unknown) {
      toast.error("PDF add nahi hui — URL check karke dobara try karo");
      return null;
    }
  }, [pdfs.length]);

  const deletePdf = useCallback(async (pdfId: string) => {
    const pdf = pdfs.find(p => p.id === pdfId);
    if (!pdf) return;
    
    // Try to delete from storage if it's in our bucket. Handles both the
    // legacy public URL form and the new storage:// URI form.
    const storagePath = extractLecturePdfPath(pdf.file_url);
    if (storagePath) {
      await supabase.storage.from("lecture-pdfs").remove([storagePath]);
    }

    const { error } = await supabase.from("lesson_pdfs").delete().eq("id", pdfId);
    if (error) {
      toast.error("Delete nahi hua — dobara try karo");
      return;
    }
    setPdfs(prev => prev.filter(p => p.id !== pdfId));
    toast.success("PDF removed");
  }, [pdfs]);

  return { pdfs, loading, fetchPdfs, addPdf, addPdfByUrl, deletePdf };
};
