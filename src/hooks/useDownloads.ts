import { useState, useEffect, useCallback } from "react";
import {
  getDownloads as dbGet,
  deleteDownload as dbDelete,
  type DownloadRecord,
} from "../lib/indexedDB";
import {
  saveAndIndexDownload,
  resolveDownloadUri,
  deleteLocalDownloadFile,
} from "../services/savedDownloads";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/sentry";

export type { DownloadRecord };

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const records = await dbGet();
      setDownloads(records);
    } catch (err) {
      logger.error("useDownloads: failed to read IndexedDB", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => { refresh(); };
    window.addEventListener("downloads:refresh", onRefresh);
    return () => window.removeEventListener("downloads:refresh", onRefresh);
  }, [refresh]);

  /**
   * Save a file to the device (native filesystem when available) and index it
   * so it appears in the offline-first /downloads page.
   */
  const addDownload = useCallback(
    async (
      title: string,
      url: string,
      filename: string,
      fileType: DownloadRecord["fileType"] = "PDF",
      blob?: Blob
    ) => {
      const key = url || filename;
      const toastId = toast.loading(`Downloading "${title}"…`);
      try {
        const result = await saveAndIndexDownload(
          { title, url, filename, fileType, blob },
          (percent) =>
            setProgress((prev) => ({ ...prev, [key]: percent }))
        );
        const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
          .Capacitor?.isNativePlatform?.();
        if (isNative && !result.nativeSaved && !result.indexedFallback) {
          throw new Error("Native file save failed");
        }
        toast.success(
          result.nativeSaved
            ? `Saved "${title}" to device`
            : result.indexedFallback
              ? `Saved "${title}" for offline reading`
              : `"${title}" downloaded`,
          { id: toastId }
        );
        // A failing refresh must never turn a successful save into a crash /
        // stuck progress bar (app-crash-shield).
        try { await refresh(); } catch (e) { logger.warn("useDownloads: refresh after save failed", { err: String(e) }); }
      } catch (err) {
        reportError(err, {
          surface: "useDownloads.addDownload",
          title,
          filename,
          fileType,
          hasBlob: Boolean(blob),
        });
        const msg = (err as { message?: string } | null)?.message || "Download failed";
        toast.error(msg, { id: toastId });
      } finally {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [refresh]
  );

  const deleteDownloadById = useCallback(
    async (id: number) => {
      try {
        const rec = downloads.find((d) => d.id === id);
        if (rec) await deleteLocalDownloadFile(rec);
        await dbDelete(id);
        setDownloads((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        reportError(err, { surface: "useDownloads.deleteDownload", id });
      }
    },
    [downloads]
  );

  return {
    downloads,
    loading,
    progress,
    addDownload,
    deleteDownload: deleteDownloadById,
    resolveDownloadUri,
    refresh,
  };
}
