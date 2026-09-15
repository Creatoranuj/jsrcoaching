import { useCallback, useEffect, useState } from "react";
import { HardDrive, Trash2, Loader2, CheckSquare, Square, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../ui/sheet";
import { Button } from "../../ui/button";
import { libraryDB } from "../../../lib/libraryDB";
import { itemDB } from "../../../lib/personalLibraryDB";
import { getDownloads, deleteDownload as dbDelete, type DownloadRecord } from "../../../lib/indexedDB";
import { deleteLocalDownloadFile } from "../../../services/savedDownloads";
import { getStorageEstimate, requestPersistentStorage, type StorageEstimate } from "../../../lib/persistentStorage";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface Usage {
  library: number;
  personal: number;
  downloads: number;
  count: number;
}

/**
 * Storage manager: shows how much space each tier uses (3-tier model documented
 * in services/libraryNotes.ts) and lets the user clear the cached PDF index.
 */
export default function StorageManagerSheet({ open, onOpenChange }: Props) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manageMode, setManageMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lib, items, dls, est] = await Promise.all([
        libraryDB.all().catch((): import("../../../lib/libraryDB").LibraryRecord[] => []),
        itemDB.all().catch((): import("../../../lib/personalLibraryDB").PersonalItem[] => []),
        getDownloads().catch((): import("../../../lib/indexedDB").DownloadRecord[] => []),
        getStorageEstimate(),
      ]);
      const library = lib.reduce((s: number, r) => s + (r.size_bytes || 0), 0);
      const personal = items.reduce((s: number, r) => s + (r.size_bytes || 0), 0);
      const dl = dls.reduce((s: number, r) => s + (r.size_bytes || 0), 0);
      setUsage({
        library,
        personal,
        downloads: dl,
        count: lib.length + items.length + dls.length,
      });
      setDownloads(dls);
      setEstimate(est);
    } catch {
      setUsage({ library: 0, personal: 0, downloads: 0, count: 0 });
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setSelected(new Set());
      setManageMode(false);
    }
  }, [open, load]);

  const clearCache = async () => {
    setBusy(true);
    try {
      const recs = await libraryDB.all().catch(() => []);
      await Promise.all(recs.map((r) => libraryDB.delete(r.pdf_id).catch(() => {})));
      toast.success("Cached library index cleared");
      await load();
    } catch {
      toast.error("Could not clear cache");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(downloads.map((d) => d.id!).filter((x) => x != null)));
  const clearSelection = () => setSelected(new Set());

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    const t = toast.loading(`Removing ${ids.length} file${ids.length > 1 ? "s" : ""}…`);
    try {
      for (const id of ids) {
        const rec = downloads.find((d) => d.id === id);
        if (rec) await deleteLocalDownloadFile(rec).catch(() => {});
        await dbDelete(id).catch(() => {});
      }
      toast.success(`Removed ${ids.length} file${ids.length > 1 ? "s" : ""}`, { id: t });
      window.dispatchEvent(new Event("downloads:refresh"));
      setSelected(new Set());
      setManageMode(false);
      await load();
    } catch {
      toast.error("Some files could not be removed", { id: t });
    } finally {
      setBusy(false);
    }
  };

  const enablePersist = async () => {
    const ok = await requestPersistentStorage();
    toast[ok ? "success" : "error"](
      ok ? "Storage marked as persistent" : "Browser denied persistent storage"
    );
    await load();
  };

  const total = usage ? usage.library + usage.personal + usage.downloads : 0;
  const quotaPct =
    estimate && estimate.quota > 0 ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" /> Storage
          </SheetTitle>
          <SheetDescription>
            {usage ? `${formatBytes(total)} across ${usage.count} files` : "Calculating…"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {estimate?.supported && estimate.quota > 0 && (
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Device storage</span>
                <span>
                  {formatBytes(estimate.usage)} / {formatBytes(estimate.quota)}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {estimate.persisted ? "Persistent (OS won't evict)" : "Not persistent — OS may evict"}
                </span>
                {!estimate.persisted && (
                  <button
                    onClick={enablePersist}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          )}

          {usage ? (
            <>
              <Row label="My Library" value={formatBytes(usage.personal)} />
              <Row label="Offline Library" value={formatBytes(usage.library)} />
              <Row label="Downloads" value={formatBytes(usage.downloads)} />
            </>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {downloads.length > 0 && (
            <div className="rounded-lg border bg-background">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">Manage downloads</span>
                <button
                  onClick={() => {
                    setManageMode((v) => !v);
                    setSelected(new Set());
                  }}
                  className="text-xs text-primary"
                >
                  {manageMode ? "Cancel" : "Select"}
                </button>
              </div>
              {manageMode && (
                <>
                  <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs">
                    <button onClick={selected.size === downloads.length ? clearSelection : selectAll} className="text-primary">
                      {selected.size === downloads.length ? "Clear all" : "Select all"}
                    </button>
                    <span className="text-muted-foreground">{selected.size} selected</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {downloads.map((d) => {
                      const isSel = d.id != null && selected.has(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => d.id != null && toggleSelect(d.id)}
                          className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                        >
                          {isSel ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1 truncate text-sm">{d.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatBytes(d.size_bytes || 0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t p-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={busy || selected.size === 0}
                      onClick={deleteSelected}
                    >
                      {busy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete selected ({selected.size})
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          <Button
            variant="destructive"
            className="mt-2 w-full"
            onClick={clearCache}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Clear cached library index
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your downloaded files stay on the device — only the cache index is cleared.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span className="text-sm font-medium text-muted-foreground">{value}</span>
    </div>
  );
}
