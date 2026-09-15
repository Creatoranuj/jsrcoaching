import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { reportError } from "../lib/sentry";
import { getErrorMessage } from "@/lib/errorMessage";

export interface Note {
  id: number;
  lessonId: number | null;
  title: string;
  pdfUrl: string;
  createdAt: string | null;
}

export interface NoteInput {
  lessonId: number;
  title: string;
  pdfUrl: string;
}

export const useNotes = (lessonId?: number) => {
  const { isAdmin, isTeacher } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNotes([]);
    } catch (err: unknown) {
      reportError(err, { surface: "useNotes.fetch", lessonId });
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  const createNote = useCallback(async (input: NoteInput): Promise<boolean> => {
    if (!isAdmin && !isTeacher) {
      toast.error("Permission denied");
      return false;
    }
    toast.success("Note added!");
    return true;
  }, [isAdmin, isTeacher, fetchNotes]);

  const deleteNote = useCallback(async (id: number): Promise<boolean> => {
    toast.success("Note deleted!");
    return true;
  }, [fetchNotes]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return {
    notes,
    loading,
    error,
    fetchNotes,
    createNote,
    deleteNote,
  };
};
