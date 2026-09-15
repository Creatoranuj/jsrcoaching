import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { Download, Trash2, FolderOpen, Search, BookOpen, HardDrive, BookMarked, Loader2, RefreshCw, HardDriveDownload, CheckSquare } from "lucide-react";
import { exportDownloadToDevice } from "../lib/exportDownload";
import { openFileNative } from "../lib/nativeFileOpener";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useDownloads, type DownloadRecord } from "../hooks/useDownloads";
import { releaseDownloadUri } from "../services/savedDownloads";
import { toast } from "sonner";
import UniversalFileViewer from "../components/library/UniversalFileViewer";
import ReaderErrorBoundary from "../components/library/ReaderErrorBoundary";
// Autoscroll FAB intentionally removed from Downloads: list surface, no long-form reading.
import StorageManagerSheet from "../components/library/reader/StorageManagerSheet";
import MyLibrary from "../components/library/personal/MyLibrary";
import FileTypeIcon from "../components/common/FileTypeIcon";
import { addUrlToDefaultLibrary, addBlobToDefaultLibrary } from "../services/personalLibrary";
import { downloadFileDB } from "../lib/indexedDB";
import FormatFilterChips from "../components/common/FormatFilterChips";
import { ALL_CHIP, applyFormatFilter, groupByFormat } from "../lib/formatChips";
import useOverlayBackClose from "../hooks/useOverlayBackClose";
import SelectionActionBar from "../components/library/SelectionActionBar";
import { PriorityBadgeChip } from "../components/library/PriorityBadge";
import { priorityKeyForDownload, getPriority, priorityRank } from "../lib/itemPriority";
import CrashShield from "../components/system/CrashShield";
import { addBreadcrumb } from "../lib/sentry";

/** Yield to the event loop so long bulk loops never block input (ANR guard). */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Chunked base64 → Blob. Decoding a whole multi-MB base64 string in one
 * `atob` + byte-loop allocates 2–3× the file size at once and OOMs the
 * WebView on low-RAM Android. Decoding in 32k-char slices keeps peak
 * memory flat. Part of the app-crash-shield skill.
 */
function base64ToBlob(b64: string, mime: string): Blob {
  const CHUNK = 0x8000;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) {
    const bin = atob(b64.slice(i, i + CHUNK));
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j += 1) arr[j] = bin.charCodeAt(j);
    parts.push(arr);
  }
  return new Blob(parts as unknown as BlobPart[], { type: mime });
}

/** Refuse in-memory copies above this decoded size (bytes). */
const MAX_INMEMORY_BYTES = 120 * 1024 * 1024;


import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

const fileTypeBadgeClass: Record<string, string> = {
  PDF: "bg-red-500/10 text-red-600 dark:text-red-400",
  NOTES: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  DPP: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  MD: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  MARKDOWN: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  IMAGE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const Downloads = () => {
  // Screen protection intentionally not applied here; only LessonView blocks recording for students.
  const navigate = useNavigate();
  const { downloads, loading, deleteDownload, resolveDownloadUri, refresh } = useDownloads();
  const [search, setSearch] = useState("");
  const [openFile, setOpenFile] = useState<DownloadRecord | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [formatFilter, setFormatFilter] = useState<string>(ALL_CHIP);

  const [opening, setOpening] = useState<number | null>(null);

  // Multi-select state for bulk operations on "From Courses" tab.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const closeOpenFile = useCallback(() => {
    // Release the blob URL minted for this record (no-op for remote URLs).
    if (openFile) releaseDownloadUri(openFile);
    setOpenFile(null);
    setOpenUrl(null);
  }, [openFile]);

  useOverlayBackClose(!!openFile && !!openUrl, closeOpenFile, "downloads-file-viewer");

  // Release any live blob URL if the page unmounts while the viewer is open
  // (hardware back / route change) — otherwise the blob leaks and adds memory
  // pressure that later shows up as an OOM crash. Ref avoids re-running the
  // effect on every openFile change.
  const openFileRef = useRef<DownloadRecord | null>(null);
  openFileRef.current = openFile;
  useEffect(() => {
    addBreadcrumb("downloads", "mount");
    return () => {
      const rec = openFileRef.current;
      if (rec) { try { releaseDownloadUri(rec); } catch { /* noop */ } }
    };
  }, []);

  // Also close selection mode on hardware back.
  useOverlayBackClose(selectMode, () => {
    setSelectMode(false);
    setSelected(new Set());
  }, "downloads-select-mode");

  const searched = downloads.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.fileType.toLowerCase().includes(search.toLowerCase())
  );
  const formatChips = useMemo(
    () => groupByFormat(searched, (d) => d.fileType),
    [searched]
  );
  const filtered = useMemo(() => {
    const base = applyFormatFilter(searched, formatFilter, (d) => d.fileType);
    // Sort by user-assigned priority (P1 → P2 → P3 → unset), then keep
    // the original recency order from the DB query inside each bucket.
    return [...base].sort((a, b) => {
      const pa = priorityRank(getPriority(`dl_${a.id}`));
      const pb = priorityRank(getPriority(`dl_${b.id}`));
      return pa - pb;
    });
  }, [searched, formatFilter]);


  const handleDelete = async (id: number | undefined, title: string) => {
    if (id === undefined) return;
    await deleteDownload(id);
    toast.success(`"${title}" removed from downloads`);
  };

  // ---- Bulk operations ----
  const toggleSelect = (id: number | undefined) => {
    if (id === undefined) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectedItems = useMemo(
    () => filtered.filter((d) => d.id != null && selected.has(d.id)),
    [filtered, selected]
  );
  const selectedPriorityKeys = useMemo(
    () => selectedItems
      .map((d) => priorityKeyForDownload(d.id))
      .filter((k): k is string => !!k),
    [selectedItems]
  );
  const exitSelection = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const enterSelectionWith = (id: number | undefined) => {
    setSelectMode(true);
    if (id != null) setSelected(new Set([id]));
  };
  const selectAllVisible = () => {
    setSelected(new Set(filtered.map((d) => d.id).filter((x): x is number => x != null)));
  };
  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    setBulkBusy(true);
    let ok = 0;
    for (const item of selectedItems) {
      if (item.id == null) continue;
      try {
        await deleteDownload(item.id);
        ok += 1;
      } catch (err) {
        console.warn("[Downloads] bulk delete failed for", item.id, err);
      }
      await yieldToUi();
    }
    setBulkBusy(false);
    exitSelection();
    toast.success(`Removed ${ok} download${ok === 1 ? "" : "s"}`);
  };
  const handleBulkMoveToLibrary = async () => {
    if (selectedItems.length === 0) return;
    setBulkBusy(true);
    const t = toast.loading(`Moving ${selectedItems.length} to My Library…`);
    let ok = 0;
    for (const item of selectedItems) {
      try {
        await handleAddToLibrary(item, { silent: true });
        ok += 1;
      } catch (err) {
        console.warn("[Downloads] bulk move failed", err);
      }
      // Yield between items so the WebView can paint / GC the previous blob
      // instead of stacking several large buffers in one macrotask.
      await yieldToUi();
    }
    setBulkBusy(false);
    toast.success(`Added ${ok} to My Library`, { id: t });
    window.dispatchEvent(new Event("personalLibrary:refresh"));
    exitSelection();
  };


  const handleOpen = async (item: DownloadRecord) => {
    if (opening != null) return; // ignore double-tap
    addBreadcrumb("downloads", "open", { id: item.id, fileType: item.fileType });
    if (item.id != null) setOpening(item.id);
    // In-app first: users expect Open → stays inside the app (not Drive/Adobe).
    // The OS handoff via openFileNative is still available as an explicit
    // "Open in another app" affordance elsewhere in the reader.
    let uri: string | null = null;
    try {
      uri = await resolveDownloadUri(item);
    } catch (err) {
      console.warn("[Downloads] resolve failed, falling back to remote URL", err);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast.error("Offline copy missing. Re-download this file while online.");
        setOpening(null);
        return;
      }
    }
    const finalUrl = uri || item.url;
    if (!finalUrl) {
      toast.error("Could not open file — no source available.");
      setOpening(null);
      return;
    }
    setOpenUrl(finalUrl);
    setOpenFile(item);
    setOpening(null);
  };

  const handleAddToLibrary = async (
    item: DownloadRecord,
    opts: { silent?: boolean } = {}
  ) => {
    if (item.id == null) return;
    if (!opts.silent && addingId) return;
    addBreadcrumb("downloads", "add-to-library", { id: item.id, fileType: item.fileType });
    if (!opts.silent) setAddingId(item.id);
    const t = opts.silent ? null : toast.loading("Adding to My Library…");
    try {
      // Prefer local bytes (web IndexedDB blob or native filesystem) — avoids
      // CORS/"failed to fetch" issues when the remote URL isn't directly
      // fetchable from the WebView (Bunny, signed URLs that have expired, etc.)
      let blob: Blob | null = null;

      // 1) web-indexeddb stored blob (path-tagged)
      if (item.local_path?.startsWith("web-indexeddb:") && item.id != null) {
        const row = await downloadFileDB.get(item.id);
        blob = row?.blob ?? null;
      }

      // 1b) Some records have no local_path tag but bytes ARE in IndexedDB
      // (legacy rows / partial saves). Try the id directly before giving up.
      if (!blob && item.id != null) {
        const row = await downloadFileDB.get(item.id);
        blob = row?.blob ?? null;
      }

      // 2) native filesystem
      if (!blob && item.local_path && !item.local_path.startsWith("web-indexeddb:")) {
        try {
          const { Capacitor } = await import("@capacitor/core");
          if (Capacitor.isNativePlatform()) {
            const { Filesystem, Directory } = await import("@capacitor/filesystem");
            const parsed = item.local_path.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
            const dirName = parsed?.[1] ?? "Data";
            const filePath = parsed?.[2] ?? item.local_path;
            const directory = (Directory as unknown as Record<string, unknown>)[dirName] ?? Directory.Data;
            const res = await Filesystem.readFile({ path: filePath, directory: directory as never });
            const data = (res as { data: string | Blob }).data;
            if (typeof data === "string") {
              // 3/4 of the base64 length ≈ decoded byte size.
              const approxBytes = Math.floor((data.length * 3) / 4);
              if (approxBytes > MAX_INMEMORY_BYTES) {
                throw new Error("File too large to move on this device — open it directly from Downloads.");
              }
              blob = base64ToBlob(data, item.mime || "application/pdf");
            } else {
              blob = data;
            }
          }
        } catch (err) {
          console.warn("[Downloads] native read failed, will try remote fetch", err);
        }
      }

      if (blob) {
        await addBlobToDefaultLibrary(blob, item.title, item.filename);
      } else if (item.url && !item.url.startsWith("blob:")) {
        // Only attempt a remote fetch when the URL is actually re-fetchable.
        // Stale blob: URLs from a previous session always fail with "failed to fetch".
        await addUrlToDefaultLibrary(item.url, item.title, item.filename);
      } else {
        throw new Error("Offline copy missing. Re-download this file while online and try again.");
      }
      if (opts.silent) {
        window.dispatchEvent(new Event("personalLibrary:refresh"));
      } else {
        toast.success("Added to My Library", { id: t! });
        window.dispatchEvent(new Event("personalLibrary:refresh"));
      }
    } catch (err) {
      const msg = (err as Error)?.message || "Could not add to My Library";
      if (opts.silent) {
        console.warn("[Downloads] silent add failed", msg);
        throw err;
      }
      toast.error(
        /failed to fetch|network/i.test(msg)
          ? "Couldn't add — file source unreachable. Re-download this file while online and try again."
          : msg,
        { id: t! }
      );
    } finally {
      if (!opts.silent) setAddingId(null);
    }
  };

  const handleExport = async (item: DownloadRecord) => {
    if (item.id == null || exportingId) return;
    addBreadcrumb("downloads", "export", { id: item.id, fileType: item.fileType });
    setExportingId(item.id);
    const t = toast.loading("Preparing export…");
    try {
      const ok = await exportDownloadToDevice(item);
      if (ok) toast.success("Choose where to save the file", { id: t });
      else toast.dismiss(t);
    } catch (err) {
      const msg = (err as Error)?.message || "Export failed";
      toast.error(msg, { id: t });
    } finally {
      setExportingId(null);
    }
  };

  if (openFile && openUrl) {
    return (
      <ReaderErrorBoundary onBack={closeOpenFile} resetKey={openFile.id ?? openUrl} label="downloads-viewer">
        <UniversalFileViewer
          url={openUrl}
          title={openFile.title}
          filename={openFile.filename}
          fileType={openFile.fileType}
          itemId={openFile.id !== undefined ? `dl_${openFile.id}` : undefined}
          source="downloads"
          hideDownload={!!openFile.local_path}
          onBack={closeOpenFile}
        />
      </ReaderErrorBoundary>
    );
  }

  return (
    <CrashShield source="downloads-page">
    <main className="min-h-dvh bg-background pb-24 safe-area-bottom">
      {opening != null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 shadow-lg border">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Opening file…</span>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-card border-b min-h-[52px] flex items-center px-4 sticky top-0 z-30 shadow-sm gap-3 safe-area-top">
        <BackButton />
        <div className="flex items-center gap-2 flex-1">
          <Download className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-foreground text-base">My Downloads</h1>
          {downloads.length > 0 && (
            <Badge variant="secondary" className="text-xs">{downloads.length}</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStorageOpen(true)}
          className="shrink-0"
          aria-label="Storage"
        >
          <HardDrive className="h-4 w-4" />
        </Button>
      </header>
      <StorageManagerSheet open={storageOpen} onOpenChange={setStorageOpen} />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Tabs defaultValue="course" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="course" className="text-xs">From Courses</TabsTrigger>
            <TabsTrigger value="mine" className="text-xs">My Library</TabsTrigger>
          </TabsList>

          <TabsContent value="course" className="mt-4 space-y-5">
            <p className="text-[11px] text-muted-foreground -mt-2 px-1">
              Files you saved from your courses (PDFs, Notes, DPPs). Available offline, even without internet.
            </p>
            {downloads.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search downloads…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={selectMode}
                  />
                </div>
                <Button
                  variant={selectMode ? "default" : "outline"}
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => (selectMode ? exitSelection() : setSelectMode(true))}
                  aria-pressed={selectMode}
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  <span>{selectMode ? "Done" : "Select"}</span>
                </Button>
              </div>
            )}

            {downloads.length > 0 && formatChips.length > 1 && !selectMode && (
              <FormatFilterChips
                chips={formatChips}
                total={searched.length}
                selected={formatFilter}
                onChange={setFormatFilter}
              />
            )}


            {loading && (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card animate-pulse">
                    <div className="h-10 w-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 rounded bg-muted" />
                      <div className="h-2.5 w-1/2 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && downloads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="h-9 w-9 text-primary" />
                </div>
                <div className="px-6">
                  <h2 className="text-lg font-semibold text-foreground mb-1">Abhi tak koi lesson download nahi hua</h2>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Jo lessons aap download karenge, wo yahan dikhenge — bina internet bhi khulenge.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => navigate("/my-courses")}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    Go to Courses
                  </Button>
                  <Button variant="outline" onClick={() => refresh()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            )}

            {!loading && downloads.length > 0 && filtered.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No downloads matching "{search}"
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className={`space-y-2 ${selectMode ? "pb-24" : ""}`}>
                {filtered.map((item) => {
                  const isChecked = item.id != null && selected.has(item.id);
                  const rowClick = selectMode
                    ? () => toggleSelect(item.id)
                    : undefined;
                  return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent/5 transition-colors group ${
                      isChecked ? "border-primary/60 bg-primary/5" : "border-border"
                    } ${selectMode ? "cursor-pointer select-none" : ""}`}
                    onClick={rowClick}
                    onContextMenu={(e) => {
                      if (selectMode) return;
                      e.preventDefault();
                      enterSelectionWith(item.id);
                    }}
                  >
                    {selectMode && (
                      <span
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleSelect(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </span>
                    )}
                    <FileTypeIcon type={item.fileType} url={item.url} className="h-10 w-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge
                          className={`text-[10px] px-1.5 py-0 h-4 ${fileTypeBadgeClass[item.fileType] || "bg-muted text-muted-foreground"}`}
                        >
                          {item.fileType}
                        </Badge>
                        {item.local_path && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Offline
                          </Badge>
                        )}
                        {item.id != null && (
                          <PriorityBadgeChip itemKey={`dl_${item.id}`} />
                        )}
                        <span className="text-[10px] text-muted-foreground">{formatDate(item.downloadedAt)}</span>
                      </div>
                    </div>
                    {!selectMode && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-primary hover:bg-primary/10 text-xs"
                          onClick={() => handleOpen(item)}
                        >
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          onClick={() => handleAddToLibrary(item)}
                          disabled={addingId === item.id}
                          aria-label="Add to My Library"
                          title="Add to My Library"
                        >
                          {addingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          onClick={() => handleExport(item)}
                          disabled={exportingId === item.id || !item.local_path}
                          aria-label="Save to internal storage"
                          title={item.local_path ? "Save to phone storage (Downloads / Files)" : "Re-download first to enable saving"}
                        >
                          {exportingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete download"
                              className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >

                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove from downloads?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{item.title}" will be removed from your downloads history. The original file is not deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                onClick={() => handleDelete(item.id, item.title)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-4">
            <MyLibrary />
          </TabsContent>
        </Tabs>
      </div>

      {selectMode && (
        <SelectionActionBar
          count={selected.size}
          total={filtered.length}
          onClear={exitSelection}
          onSelectAll={selectAllVisible}
          selectedKeys={selectedPriorityKeys}
          onDelete={handleBulkDelete}
          extraActions={
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handleBulkMoveToLibrary}
              disabled={bulkBusy || selected.size === 0}
            >
              <BookMarked className="h-3.5 w-3.5 mr-1" /> To Library
            </Button>
          }
        />
      )}
    </main>
    </CrashShield>
  );
};


export default Downloads;
