import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import {
  downloadPdf as svcDownload,
  deletePdf as svcDelete,
  enqueueDownload,
  getLocalFileUri,
  listDownloaded,
  reconcileEntitlements,
  repairInterrupted,
  cancelDownload as svcCancel,
  type DownloadProgress,
  type PdfMeta,
} from "../services/pdfLibrary";
import type { LibraryRecord } from "../lib/libraryDB";
import { useOnlineStatus } from "./useOnlineStatus";
import { toast } from "sonner";
import { reportError } from "../lib/sentry";

export interface CatalogPdf extends PdfMeta {
  file_name: string;
  file_size: number | null;
  created_at: string;
}

interface RawPdfRow {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  version: number | null;
  subject: string | null;
  skill_level: "beginner" | "intermediate" | "advanced" | null;
  created_at: string;
}

export function usePdfLibrary() {
  const online = useOnlineStatus();
  const [catalog, setCatalog] = useState<CatalogPdf[]>([]);
  const [downloaded, setDownloaded] = useState<LibraryRecord[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(async () => {
    setDownloaded(await listDownloaded());
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (!online) return;
    const { data, error } = await supabase
      .from("lesson_pdfs")
      .select("id,file_name,file_url,file_size,version,subject,skill_level,created_at")
      .order("skill_level", { ascending: true })
      .order("subject", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      reportError(error, { surface: "usePdfLibrary.catalog" });
      return;
    }
    const rows = (data as unknown as RawPdfRow[]) || [];
    setCatalog(
      rows.map((r) => ({
        pdf_id: r.id,
        title: r.file_name,
        url: r.file_url,
        version: r.version ?? 1,
        subject: r.subject,
        skill_level: r.skill_level ?? "beginner",
        file_name: r.file_name,
        file_size: r.file_size,
        size_bytes: r.file_size ?? undefined,
        created_at: r.created_at,
      }))
    );
    // Server-driven entitlement sync: drop local copies the server no longer returns.
    const ids = new Set(rows.map((r) => r.id));
    const removed = await reconcileEntitlements(ids);
    if (removed > 0) {
      toast.info(`Removed ${removed} PDF${removed === 1 ? "" : "s"} you no longer have access to.`);
      await refreshLocal();
    }
  }, [online, refreshLocal]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await repairInterrupted();
      await refreshLocal();
      await refreshCatalog();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refreshCatalog, refreshLocal]);

  // Re-pull catalog when coming back online (stale-while-revalidate).
  useEffect(() => {
    if (online) refreshCatalog();
  }, [online, refreshCatalog]);

  const download = useCallback(
    async (pdf: CatalogPdf) => {
      try {
        await enqueueDownload(() =>
          svcDownload(pdf, (p: DownloadProgress) => {
            setProgress((prev) => ({ ...prev, [p.pdf_id]: p.percent }));
          })
        );
        setProgress((prev) => {
          const next = { ...prev };
          delete next[pdf.pdf_id];
          return next;
        });
        await refreshLocal();
        toast.success(`Saved "${pdf.title}" to your device`);
      } catch (err) {
        const msg = (err as Error)?.message || "Download failed";
        if (msg === "WEB_FALLBACK") return;
        if ((err as Error)?.name === "AbortError") {
          toast.message("Download cancelled");
        } else {
          toast.error(`Download failed: ${msg}`);
        }
        setProgress((prev) => {
          const next = { ...prev };
          delete next[pdf.pdf_id];
          return next;
        });
      }
    },
    [refreshLocal]
  );

  const remove = useCallback(
    async (pdf_id: string) => {
      await svcDelete(pdf_id);
      await refreshLocal();
      toast.success("Removed from device");
    },
    [refreshLocal]
  );

  const cancel = useCallback((pdf_id: string) => {
    svcCancel(pdf_id);
  }, []);

  const downloadedIds = useMemo(
    () => new Map(downloaded.map((r) => [r.pdf_id, r] as const)),
    [downloaded]
  );

  const totalUsed = useMemo(
    () => downloaded.reduce((s, r) => s + (r.size_bytes || 0), 0),
    [downloaded]
  );

  return {
    online,
    loading,
    catalog,
    downloaded,
    downloadedIds,
    progress,
    totalUsed,
    download,
    remove,
    cancel,
    getLocalFileUri,
    refreshCatalog,
  };
}