import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { safeGet, safeSet, safeRemove } from "../lib/storage";
import { logger } from "../lib/logger";

export interface Batch {
  id: number;
  title: string;
  grade: string | null;
  image_url: string | null;
}

interface BatchContextType {
  batches: Batch[];
  selectedBatch: Batch | null;
  setSelectedBatch: (batch: Batch | null) => void;
  loading: boolean;
}

const BatchContext = createContext<BatchContextType | undefined>(undefined);

const STORAGE_KEY = "nb_selected_batch";

export const BatchProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatchState] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(false);

  // Load batches from user's enrollments
  useEffect(() => {
    if (!user) {
      setBatches([]);
      setSelectedBatchState(null);
      return;
    }

    const fetchBatches = async () => {
      setLoading(true);
      try {
        const query = () => supabase
          .from("enrollments")
          .select("course_id, courses ( id, title, grade, image_url )")
          .eq("user_id", String(user.id))
          .eq("status", "active");

        let { data, error } = await query();
        // A stale access token makes PostgREST evaluate the request as `anon`
        // → 42501 "permission denied for table enrollments" / PGRST303 "JWT
        // expired". Refresh the session once and retry before giving up; this
        // is an expected lifecycle event, not an application error.
        if (error && /42501|PGRST30[13]|jwt expired|permission denied/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed?.session) ({ data, error } = await query());
        }

        if (error) throw error;

        // Deduplicate by course id — same course may have multiple enrollment rows
        const seen = new Set<number>();
        const enrolledBatches: Batch[] = (data || [])
          .map((e) => e.courses)
          .filter(Boolean)
          .filter((c) => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          })
          .map((c) => ({
            id: c.id,
            title: c.title,
            grade: c.grade,
            image_url: c.image_url,
          }));

        setBatches(enrolledBatches);

        // Restore from localStorage
        const saved = safeGet(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const found = enrolledBatches.find((b) => b.id === parsed.id);
            if (found) {
              setSelectedBatchState(found);
            } else if (enrolledBatches.length > 0) {
              setSelectedBatchState(enrolledBatches[0]);
            }
          } catch {
            if (enrolledBatches.length > 0) setSelectedBatchState(enrolledBatches[0]);
          }
        } else if (enrolledBatches.length > 0) {
          setSelectedBatchState(enrolledBatches[0]);
        }
      } catch (err) {
        const e = err as { code?: string; message?: string };
        if (/42501|PGRST30[13]|jwt expired|permission denied/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) {
          // Session is genuinely gone (refresh failed) — AuthContext will sign
          // the user out; don't double-report as an app error.
          logger.warn("Batches skipped: session expired", { code: e?.code });
        } else {
          logger.error("Error fetching batches", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, [user]);

  const setSelectedBatch = useCallback((batch: Batch | null) => {
    setSelectedBatchState(batch);
    if (batch) {
      safeSet(STORAGE_KEY, JSON.stringify({ id: batch.id, title: batch.title }));
    } else {
      safeRemove(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({ batches, selectedBatch, setSelectedBatch, loading }),
    [batches, selectedBatch, setSelectedBatch, loading]
  );

  return <BatchContext.Provider value={value}>{children}</BatchContext.Provider>;
};

export const useBatch = () => {
  const context = useContext(BatchContext);
  if (!context) {
    throw new Error("useBatch must be used within a BatchProvider");
  }
  return context;
};
