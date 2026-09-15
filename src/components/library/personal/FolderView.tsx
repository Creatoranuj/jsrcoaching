import { useCallback, useMemo, useRef, useState } from "react";
import {
  // Plus removed — the "Add files" button it powered was deleted (FAB owns adds).
  Trash2,
  Download,
  FolderInput,
  MoreVertical,
  Pencil,
  Copy,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  CheckSquare,
} from "lucide-react";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { useFolderItems } from "../../../hooks/usePersonalLibrary";
import type { ItemSort } from "../../../services/personalLibrary";
import { fmtBytes } from "../../../lib/personalLibraryQuota";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import UniversalFileViewer from "../UniversalFileViewer";
import ReaderErrorBoundary from "../ReaderErrorBoundary";
import MoveTargetDialog from "./MoveTargetDialog";
import FolderNameDialog from "./FolderNameDialog";
import { toast } from "sonner";
import FileTypeIcon from "../../common/FileTypeIcon";
import FormatFilterChips from "../../common/FormatFilterChips";
import { ALL_CHIP, applyFormatFilter, groupByFormat } from "../../../lib/formatChips";
import useOverlayBackClose from "../../../hooks/useOverlayBackClose";
import SelectionActionBar from "../SelectionActionBar";
import { PriorityBadgeChip } from "../PriorityBadge";
import { priorityKeyForPersonalItem, getPriority, priorityRank } from "../../../lib/itemPriority";
import { tapHaptic, selectionHaptic } from "../../../lib/native/haptics";



interface Props {
  folder: PersonalFolder;
  allFolders: PersonalFolder[];
  onRefreshOuter: () => Promise<void> | void;
  sort?: ItemSort;
  view?: "grid" | "list";
}

export default function FolderView({ folder, allFolders, onRefreshOuter, sort = "manual", view = "list" }: Props) {
  const {
    items,
    loading,
    error,
    refresh,
    addFile,
    deleteItem,
    moveItem,
    renameItem,
    replaceItem,
    duplicateItem,
    reorderItem,
    exportItem,
    getItemUri,
  } = useFolderItems(folder.id, sort);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [duplicateItemId, setDuplicateItemId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [open, setOpen] = useState<{ id: string; title: string; url: string; filename: string } | null>(null);
  const [formatFilter, setFormatFilter] = useState<string>(ALL_CHIP);

  // Multi-select for bulk delete + bulk priority on the personal library.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const closeOpenFile = useCallback(() => setOpen(null), []);

  useOverlayBackClose(!!open, closeOpenFile, "personal-library-file-viewer");
  useOverlayBackClose(selectMode, () => {
    setSelectMode(false);
    setSelected(new Set());
  }, "personal-library-select-mode");
  // Bulk-delete confirm is its own overlay layered ABOVE select mode. Without
  // this, an Android back press while the dialog is open would pop the
  // select-mode sentinel instead — clearing the selection but leaving a
  // "Delete 0 files?" dialog stuck on screen. Its sentinel sits on top of the
  // stack (opened later), so back closes the dialog first, selection survives.
  useOverlayBackClose(bulkDeleteOpen, () => setBulkDeleteOpen(false), "personal-library-bulk-delete");


  const fileTypeFor = (fileName: string, mime = "") => {
    const ext = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
    if (ext) return ext === "MARKDOWN" ? "MD" : ext;
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("markdown") || mime.includes("text")) return "MD";
    return "LINK";
  };

  const formatChips = useMemo(
    () => groupByFormat(items, (it) => fileTypeFor(it.file_name, it.mime_type)),
    [items]
  );
  const visibleItems = useMemo(() => {
    const base = applyFormatFilter(items, formatFilter, (it) => fileTypeFor(it.file_name, it.mime_type));
    // Honour user priority: P1 → P2 → P3 → unset, keep the sort prop's
    // tie-breaker for items at the same priority.
    return [...base].sort((a, b) => {
      const pa = priorityRank(getPriority(priorityKeyForPersonalItem(a.id)));
      const pb = priorityRank(getPriority(priorityKeyForPersonalItem(b.id)));
      return pa - pb;
    });
  }, [items, formatFilter]);

  const toggleSelect = (id: string) => {
    void selectionHaptic();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelection = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const selectAll = () => setSelected(new Set(visibleItems.map((it) => it.id)));
  const selectedPriorityKeys = useMemo(
    () => Array.from(selected).map(priorityKeyForPersonalItem),
    [selected]
  );
  const runBulkDelete = async () => {
    void tapHaptic("medium");
    setBulkDeleteOpen(false);
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("Nothing selected");
      exitSelection();
      return;
    }
    // Use the raw service deleteItem here — the hook's deleteItem refreshes
    // after every call, which on IndexedDB serialises the loop into N sequential
    // list-rebuilds and can visibly freeze the UI on 10+ selections. We refresh
    // once at the end instead.
    const { deleteItem: rawDelete } = await import("../../../services/personalLibrary");
    const results = await Promise.allSettled(ids.map((id) => rawDelete(id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    results.forEach((r, i) => {
      if (r.status === "rejected") console.warn("[FolderView] bulk delete failed", ids[i], r.reason);
    });
    try {
      await refresh();
    } catch (err) {
      console.warn("[FolderView] refresh after bulk delete failed", err);
    }
    if (failed > 0) {
      toast.error(
        `Deleted ${ok} · ${failed} failed${ok === 0 ? " — nothing removed" : ""}`
      );
    } else {
      toast.success(`Deleted ${ok} file${ok === 1 ? "" : "s"}`);
    }
    exitSelection();
  };


  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;

    // Batch OOM guard — cap files per pick and combined size so the
    // Android WebView isn't holding blob refs for 40+ large PDFs at once.
    const MAX_FILES = 25;
    const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
    let files = picked.slice(0, MAX_FILES);
    let dropped = picked.length - files.length;
    let running = 0;
    files = files.filter((f) => {
      if (running + f.size > MAX_TOTAL_BYTES) { dropped++; return false; }
      running += f.size;
      return true;
    });
    if (dropped > 0) {
      toast(`${dropped} skipped (batch limit ${MAX_FILES} files / 300 MB).`);
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        await addFile(f);
        toast.success(`Added "${f.name}"`);
      } catch (err) {
        toast.error((err as Error).message);
      }
      // Drop the ref so V8 can reclaim the blob between imports.
      files[i] = null as unknown as File;
    }
    await onRefreshOuter();
  };


  const handleReplacePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !replaceId) return;
    try {
      await replaceItem(replaceId, file);
      toast.success("File replaced");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReplaceId(null);
      await onRefreshOuter();
    }
  };

  /** Download a link item's bytes into the very same row (folder + order kept). */
  const saveLinkItemOffline = async (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const t = toast.loading("Downloading…");
    try {
      const [{ saveLinkOffline }, { classifyLink }] = await Promise.all([
        import("../../../lib/linkOfflineSave"),
        import("../../../lib/linkSources"),
      ]);
      await saveLinkOffline({
        url: it.local_path,
        title: it.title,
        source: (it.link_source as ReturnType<typeof classifyLink>) || classifyLink(it.local_path),
        itemId: it.id,
      });
      await refresh();
      toast.success("Saved offline", { id: t });
    } catch (err) {
      toast.error((err as Error)?.message || "Could not save offline", { id: t });
    }
  };

  const handleOpen = async (id: string, title: string, file_name: string) => {
    const url = await getItemUri(id);
    if (!url) {
      toast.error("Couldn't open file — it may have been removed.");
      return;
    }
    setOpen({ id, title, url, filename: file_name });
  };

  if (open) {
    return (
      <ReaderErrorBoundary onBack={closeOpenFile} resetKey={open.id} label="personal-library-viewer">
        <UniversalFileViewer
          url={open.url}
          title={open.title}
          filename={open.filename}
          itemId={open.id}
          fileType={fileTypeFor(open.filename)}
          source="library"
          onBack={closeOpenFile}
        />
      </ReaderErrorBoundary>
    );
  }

  // Doc-Scanner style: don't render the "Files in …" section at all when
  // there are no documents. The bottom pill FAB already prompts to add.
  const showFilesSection = loading || items.length > 0;

  return (
    <div className="space-y-3">
      {showFilesSection && (
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
          Documents ({items.length})
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          {items.length > 0 && (
            <Button
              size="sm"
              variant={selectMode ? "default" : "outline"}
              onClick={() => {
                void selectionHaptic();
                if (selectMode) exitSelection();
                else setSelectMode(true);
              }}

              aria-pressed={selectMode}
            >
              <CheckSquare className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{selectMode ? "Done" : "Select"}</span>
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,.md,.markdown,.txt,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt"
          multiple
          className="hidden"
          onChange={handlePick}
        />
        <input
          ref={replaceRef}
          type="file"
          accept="application/pdf,.pdf,.md,.markdown,.txt,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt"
          className="hidden"
          onChange={handleReplacePick}
        />
      </div>
      )}


      {!loading && items.length > 0 && formatChips.length > 1 && (
        <FormatFilterChips
          chips={formatChips}
          total={items.length}
          selected={formatFilter}
          onChange={setFormatFilter}
        />
      )}

      {loading ? (
        <div className="rounded-xl border bg-card overflow-hidden divide-y" aria-busy="true" aria-label="Loading documents">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-md bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm space-y-3">
          <p className="text-destructive font-medium">Couldn't load your files.</p>
          <p className="text-muted-foreground text-xs break-words">{error.message}</p>
          <Button size="sm" variant="outline" onClick={() => refresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      ) : items.length === 0 ? null : visibleItems.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No {formatFilter} files in this folder.
        </div>
      ) : (
        <div className={`${view === "grid" ? "grid grid-cols-2 gap-3" : "rounded-xl border bg-card overflow-hidden divide-y"} ${selectMode ? "pb-24" : ""}`}>
          {visibleItems.map((it) => {
            const i = items.findIndex((x) => x.id === it.id);
            const isFiltered = formatFilter !== ALL_CHIP;
            const isChecked = selected.has(it.id);
            return (

            <div
              key={it.id}
              className={
                (view === "grid"
                  ? "relative flex flex-col gap-2 p-3 rounded-xl border bg-card hover:bg-accent/5 transition-colors"
                  : "flex items-center gap-3 p-3 bg-card hover:bg-accent/5 transition-colors") +
                (isChecked ? (view === "grid" ? " border-primary/60 bg-primary/5" : " bg-primary/5") : "") +
                (selectMode ? " cursor-pointer select-none active:scale-[0.99] transition-transform duration-150 ease-out" : "")
              }
              onClick={selectMode ? () => toggleSelect(it.id) : undefined}
              onContextMenu={(e) => {
                if (selectMode) return;
                e.preventDefault();
                void tapHaptic("heavy");
                setSelectMode(true);
                setSelected(new Set([it.id]));
              }}
            >
              {selectMode && (
                // Visual-only: the parent row's onClick owns the toggle.
                // Wiring onCheckedChange here caused a double-toggle (checkbox
                // fired, then click bubbled to the row), so taps appeared no-op.
                <Checkbox
                  checked={isChecked}
                  aria-label={`Select ${it.title}`}
                  tabIndex={-1}
                  className="shrink-0 pointer-events-none"
                />
              )}
              <FileTypeIcon type={fileTypeFor(it.file_name, it.mime_type)} url={it.file_name} className="h-10 w-10" />
              <div className={view === "grid" ? "min-w-0" : "flex-1 min-w-0"}>
                <p className="text-sm font-semibold truncate">{it.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">
                    {it.source === "link"
                      ? `Link${it.link_source ? ` · ${it.link_source}` : ""}`
                      : fmtBytes(it.size_bytes)}{" "}
                    · {new Date(it.added_at).toLocaleDateString()}
                  </span>
                  {it.source === "link" && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Online
                    </span>
                  )}
                  <PriorityBadgeChip itemKey={priorityKeyForPersonalItem(it.id)} />
                </div>
              </div>
              {!selectMode && (
              <div className={view === "grid" ? "flex items-center justify-between gap-1" : "flex items-center gap-1 flex-shrink-0"}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-primary hover:bg-primary/10 text-xs"
                  onClick={() => handleOpen(it.id, it.title, it.file_name)}
                >
                  Open
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Item options">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setRenameTarget({ id: it.id, title: it.title })}
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setReplaceId(it.id);
                        replaceRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Replace file…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDuplicateItemId(it.id)}>
                      <Copy className="h-4 w-4 mr-2" /> Duplicate to…
                    </DropdownMenuItem>
                    {it.source === "link" && (
                      <DropdownMenuItem onClick={() => void saveLinkItemOffline(it.id)}>
                        Save offline
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setMoveItemId(it.id)}>
                      <FolderInput className="h-4 w-4 mr-2" /> Move to folder…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportItem(it.id)}>
                      <Download className="h-4 w-4 mr-2" /> Save / share copy
                    </DropdownMenuItem>
                    {sort === "manual" && !isFiltered && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={i === 0}
                          onClick={() => reorderItem(it.id, "up")}
                        >
                          <ChevronUp className="h-4 w-4 mr-2" /> Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={i === items.length - 1}
                          onClick={() => reorderItem(it.id, "down")}
                        >
                          <ChevronDown className="h-4 w-4 mr-2" /> Move down
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteId(it.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              )}
            </div>
            );
          })}


        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This file will be removed from your device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                const id = deleteId;
                setDeleteId(null);
                if (id) await deleteItem(id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FolderNameDialog
        open={!!renameTarget}
        title="Rename file"
        initialName={renameTarget?.title || ""}
        confirmLabel="Save"
        onCancel={() => setRenameTarget(null)}
        onConfirm={async (name) => {
          const t = renameTarget;
          setRenameTarget(null);
          if (t) await renameItem(t.id, name);
        }}
      />

      <MoveTargetDialog
        open={!!moveItemId}
        title="Move file to folder…"
        folders={allFolders.filter((f) => f.id !== folder.id)}
        allowRoot={false}
        onCancel={() => setMoveItemId(null)}
        onConfirm={async (newFolderId) => {
          const id = moveItemId;
          setMoveItemId(null);
          if (id && newFolderId) {
            await moveItem(id, newFolderId);
            toast.success("Moved");
          }
        }}
      />

      <MoveTargetDialog
        open={!!duplicateItemId}
        title="Duplicate file to folder…"
        folders={allFolders}
        allowRoot={false}
        onCancel={() => setDuplicateItemId(null)}
        onConfirm={async (target) => {
          const id = duplicateItemId;
          setDuplicateItemId(null);
          if (id && target) {
            await duplicateItem(id, target);
            toast.success("Duplicated");
          }
        }}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} file{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              These files will be permanently removed from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={runBulkDelete}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectMode && (
        <SelectionActionBar
          count={selected.size}
          total={visibleItems.length}
          onClear={exitSelection}
          onSelectAll={selectAll}
          selectedKeys={selectedPriorityKeys}
          onDelete={() => selected.size > 0 && setBulkDeleteOpen(true)}
        />
      )}
    </div>
  );
}
