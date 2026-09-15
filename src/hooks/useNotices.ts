import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type AppRole = 'admin' | 'teacher' | 'student';

export interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string | null;
  isPinned: boolean;
  targetRole: AppRole | null;
  expiresAt: string | null;
  createdAt: string;
  pdfUrl: string | null;
}

export interface NoticeInput {
  title: string;
  content: string;
  isPinned?: boolean;
  targetRole?: AppRole | null;
  expiresAt?: string;
}

const NOTICES_KEY = ["notices", "list"] as const;

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  is_pinned: boolean | null;
  target_role?: AppRole | null;
  expires_at: string | null;
  created_at: string | null;
  pdf_url?: string | null;
};

const mapRow = (n: NoticeRow): Notice => ({
  id: n.id,
  title: n.title,
  content: n.content,
  authorId: n.author_id ?? null,
  isPinned: n.is_pinned ?? false,
  targetRole: (n.target_role as AppRole | null) ?? null,
  expiresAt: n.expires_at ?? null,
  createdAt: n.created_at ?? "",
  pdfUrl: n.pdf_url ?? null,
});

const fetchNoticesFromDb = async (): Promise<Notice[]> => {
  const { data, error } = await supabase
    .from("notices")
    .select("id,title,content,author_id,is_pinned,target_role,expires_at,created_at,pdf_url")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const now = new Date();
  return (data as unknown as NoticeRow[] | null ?? [])
    .filter((n) => !n.expires_at || new Date(n.expires_at) > now)
    .map(mapRow);
};

export const useNotices = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const qc = useQueryClient();

  const { data: notices = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: NOTICES_KEY,
    queryFn: fetchNoticesFromDb,
    // Notices update infrequently — cache for 5 min, keep for 30.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const fetchNotices = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: NOTICES_KEY });
  }, [qc]);

  const uploadPdf = useCallback(async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `pdfs/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('notices')
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      // Bucket is private (audit H-1) — store storage:// URI; readers sign on demand.
      return `storage://notices/${filePath}`;

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload PDF";
      logger.error("Error uploading PDF:", err);
      toast.error(msg);
      return null;
    }
  }, []);

  const createNotice = useCallback(async (input: NoticeInput & { pdfUrl?: string | null }): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to create notices");
      return false;
    }
    try {
      const { error: dbError } = await supabase.from("notices").insert({
        title: input.title,
        content: input.content,
        is_pinned: input.isPinned || false,
        target_role: input.targetRole || null,
        expires_at: input.expiresAt || null,
        author_id: user.id,
        pdf_url: input.pdfUrl || null,
      });
      if (dbError) throw dbError;
      toast.success("Notice created");
      invalidate();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create notice";
      logger.error("Error creating notice:", err);
      toast.error(msg);
      return false;
    }
  }, [user, isAdmin, isTeacher, invalidate]);

  const updateNotice = useCallback(async (id: string, input: Partial<NoticeInput>): Promise<boolean> => {
    try {
      const updateData: {
        title?: string;
        content?: string;
        is_pinned?: boolean;
        target_role?: AppRole | null;
        expires_at?: string | null;
      } = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.isPinned !== undefined) updateData.is_pinned = input.isPinned;
      if (input.targetRole !== undefined) updateData.target_role = input.targetRole;
      if (input.expiresAt !== undefined) updateData.expires_at = input.expiresAt;
      const { error: dbError } = await supabase
        .from("notices")
        .update(updateData)
        .eq("id", id);
      if (dbError) throw dbError;
      toast.success("Notice updated");
      invalidate();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update notice";
      logger.error("Error updating notice:", err);
      toast.error(msg);
      return false;
    }
  }, [invalidate]);

  const deleteNotice = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error: dbError } = await supabase
        .from("notices")
        .delete()
        .eq("id", id);
      if (dbError) throw dbError;
      toast.success("Notice deleted");
      invalidate();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete notice";
      logger.error("Error deleting notice:", err);
      toast.error(msg);
      return false;
    }
  }, [invalidate]);

  return {
    notices,
    loading,
    error: error instanceof Error ? error.message : null,
    fetchNotices,
    createNotice,
    updateNotice,
    deleteNotice,
    uploadPdf,
  };
};
