import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Camera, Check, ChevronDown, ChevronRight, Folder as FolderIcon, HardDrive, Home, Link2, Plus, Search, Settings2 } from "lucide-react";
import { usePersonalStoragePermission } from "../../../hooks/usePersonalStoragePermission";
import { usePersonalLibrary } from "../../../hooks/usePersonalLibrary";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { folderDB } from "../../../lib/personalLibraryDB";
import { fmtBytes, isLowOnSpace } from "../../../lib/personalLibraryQuota";
import { addFileToFolder, getOrCreateFolder, type ItemSort } from "../../../services/personalLibrary";
import { pickPhoto } from "../../../lib/native/camera";
import PersonalLibraryGate from "./PersonalLibraryGate";
import FolderGrid from "./FolderGrid";
import FolderView from "./FolderView";
import ManageFoldersDialog from "./ManageFoldersDialog";
import AddFromLinkDialog from "./AddFromLinkDialog";
import UniversalFileViewer from "../UniversalFileViewer";
import ReaderErrorBoundary from "../ReaderErrorBoundary";
import useOverlayBackClose from "../../../hooks/useOverlayBackClose";
import { migrateLegacyLinkShelf } from "../../../lib/linkMigration";
import { Input } from "../../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Button } from "../../ui/button";
import { toast } from "sonner";
import { safeGet, safeSet } from "../../../lib/storage";
import { reportError } from "../../../lib/sentry";


const SORT_KEY = "nb_pl_sort";
const PATH_KEY = "nb_pl_path"; // persists last-opened folder trail (id[])
const SORT_LABEL: Record<ItemSort, string> = {
  manual: "Custom order",
  name: "Name A→Z",
  newest: "Newest first",
  largest: "Largest first",
};

export default function MyLibrary() {
  const { allowed, allow } = usePersonalStoragePermission();
  const rootFileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<PersonalFolder[]>([]);
  const pathRestoredRef = useRef(false);
  const [query, setQuery] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [sort, setSort] = useState<ItemSort>(() => {
    const v = safeGet(SORT_KEY) as ItemSort | null;
    return v && v in SORT_LABEL ? v : "manual";
  });
  useEffect(() => {
    safeSet(SORT_KEY, sort);
  }, [sort]);

  // Persist breadcrumb trail to localStorage → reopens last folder on revisit.
  // Save: whenever path changes (after first restore).
  useEffect(() => {
    if (!pathRestoredRef.current) return;
    safeSet(PATH_KEY, JSON.stringify(path.map((f) => f.id)));
  }, [path]);

  // Restore: on first mount (once folders are loadable), walk saved ids and
  // rebuild the PersonalFolder trail. Silently drops any deleted nodes.
  useEffect(() => {
    if (pathRestoredRef.current) return;
    let alive = true;
    (async () => {
      try {
        const raw = safeGet(PATH_KEY);
        if (!raw) {
          pathRestoredRef.current = true;
          return;
        }
        const ids: string[] = JSON.parse(raw);
        const trail: PersonalFolder[] = [];
        for (const id of ids) {
          const r = await folderDB.get(id);
          if (!r) break;
          trail.push(r);
        }
        if (alive && trail.length) setPath(trail);
      } catch {
        /* ignore */
      } finally {
        pathRestoredRef.current = true;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currentId = path.length ? path[path.length - 1].id : null;

  const {
    folders,
    allFolders,
    used,
    quota,
    free,
    error: libraryError,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    reorderFolder,
    refresh,
  } = usePersonalLibrary(currentId);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkReader, setLinkReader] = useState<{ url: string; title: string; kind: string } | null>(
    null,
  );
  const closeLinkReader = useCallback(() => setLinkReader(null), []);
  useOverlayBackClose(!!linkReader, closeLinkReader, "personal-library-link-reader");

  // Legacy localStorage link shelf → real library items (runs once).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const n = await migrateLegacyLinkShelf();
        if (n > 0 && alive) {
          await refresh();
          toast.success(`Moved ${n} saved link${n > 1 ? "s" : ""} into your folders`);
        }
      } catch (err) {
        reportError(err, { surface: "MyLibrary.linkMigration" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);





  useEffect(() => {
    if (!path.length) return;
    let alive = true;
    (async () => {
      try {
        const fresh: PersonalFolder[] = [];
        for (const node of path) {
          const r = await folderDB.get(node.id);
          if (!r) break;
          fresh.push(r);
        }
        if (alive && fresh.length !== path.length) setPath(fresh);
      } catch (err) {
        // Offline store unavailable — fall back to the root instead of crashing.
        reportError(err, { surface: "MyLibrary.syncBreadcrumb" });
        if (alive) setPath([]);
      }
    })();
    return () => {

      alive = false;
    };
  }, [allFolders, path]);

  const visibleFolders = useMemo(() => {
    if (!query.trim()) return folders;
    const q = query.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, query]);

  if (!allowed) return <PersonalLibraryGate onAllow={allow} />;

  const pct = quota ? Math.min(100, Math.round(((quota - (free ?? quota)) / quota) * 100)) : 0;
  const nearFull = isLowOnSpace(quota, free);

  const handleRootPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;

    // Batch safety caps — prevent OOM crash when the user selects a huge
    // set (e.g. long-press "select all" on a big folder). Passing the raw
    // FileList retains blob refs for every selected file in JS memory,
    // enough to kill the Android WebView before the first write finishes.
    const MAX_FILES_PER_BATCH = 25;
    const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
    let files = picked;
    let dropped = 0;
    if (files.length > MAX_FILES_PER_BATCH) {
      dropped = files.length - MAX_FILES_PER_BATCH;
      files = files.slice(0, MAX_FILES_PER_BATCH);
    }
    let running = 0;
    files = files.filter((f) => {
      if (running + f.size > MAX_TOTAL_BYTES) { dropped++; return false; }
      running += f.size;
      return true;
    });
    if (dropped > 0) {
      toast(`${dropped} skipped (batch limit ${MAX_FILES_PER_BATCH} files / 300 MB). Add the rest in a second pick.`);
    }
    if (!files.length) return;

    try {
      const targetFolder = path.length ? path[path.length - 1] : await getOrCreateFolder("General");
      // Use the batch importer — it dedupes, runs serially through the write
      // queue, inserts a 120 ms GC breather between files, and surfaces
      // per-file skip/fail reasons instead of crashing the whole batch on
      // a single low-memory file.
      const { addFilesToFolder } = await import("../../../services/personalLibrary");
      const res = await addFilesToFolder(targetFolder.id, files);
      const added = res.added.length;
      const skipped = res.skipped.length;
      const failed = res.failed.length;
      if (added && !skipped && !failed) {
        toast.success(added === 1 ? `Added "${res.added[0].title}"` : `Added ${added} files`);
      } else if (added) {
        toast.success(`Added ${added}${skipped ? ` · skipped ${skipped}` : ""}${failed ? ` · failed ${failed}` : ""}`);
      } else if (failed) {
        toast.error(res.failed[0].error || "Import failed");
      } else if (skipped) {
        toast(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} (duplicate or too large)`);
      }
      await refresh();
      if (!path.length) setPath([targetFolder]);
    } catch (err) {
      toast.error((err as Error)?.message || "Could not add file");
    }
  };

  const handleCameraCapture = async () => {
    try {
      const file = await pickPhoto("camera");
      if (!file) return;
      const targetFolder = path.length ? path[path.length - 1] : await getOrCreateFolder("General");
      // Rename to a friendlier scan-style name.
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const renamed = new File([file], `Scan_${ts}.jpg`, { type: file.type || "image/jpeg" });
      await addFileToFolder(targetFolder.id, renamed);
      toast.success("Scan saved");
      await refresh();
      if (!path.length) setPath([targetFolder]);
    } catch (err) {
      toast.error((err as Error)?.message || "Camera unavailable");
    }
  };


  // "Read now" opens the link in the same viewer stored files use.
  if (linkReader) {
    return (
      <ReaderErrorBoundary onBack={closeLinkReader} resetKey={linkReader.url} label="personal-library-link-reader">
        <UniversalFileViewer
          url={linkReader.url}
          title={linkReader.title}
          filename={`${linkReader.title}.${linkReader.kind.toLowerCase()}`}
          fileType={linkReader.kind}
          source="library"
          onBack={closeLinkReader}
        />
      </ReaderErrorBoundary>
    );
  }

  return (

    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" />
          {fmtBytes(used)} used{free !== null ? ` · ${fmtBytes(free)} free on this device` : ""}
        </div>
        {quota !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${nearFull ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {nearFull && (

          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
            Storage is almost full. Delete files you no longer need to keep the app fast.
          </p>
        )}
        {libraryError && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-2 py-1.5">
            <p className="text-[11px] text-destructive">{libraryError}</p>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        )}
      </div>



      {/* Search + folder filter + sort — minimal toolbar; add actions live in the bottom pill FAB */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Search folders & files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Folder filter — mirrors the screenshot dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5">
              <FolderIcon className="h-3.5 w-3.5" />
              <span className="max-w-[110px] truncate text-xs">
                {path.length ? path[0].name : "All folders"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => setPath([])}>
              <FolderIcon className="mr-2 h-3.5 w-3.5" />
              <span className="flex-1">All folders</span>
              {path.length === 0 && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            {allFolders
              .filter((f) => !f.parent_id)
              .map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => setPath([f])}>
                  <FolderIcon className="mr-2 h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{f.name}</span>
                  {path[0]?.id === f.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setManageOpen(true)}>
              <Settings2 className="mr-2 h-3.5 w-3.5" />
              Manage folders
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0" aria-label={`Sort: ${SORT_LABEL[sort]}`}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">{SORT_LABEL[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABEL) as ItemSort[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => setSort(k)}>
                {SORT_LABEL[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={rootFileRef}
          type="file"
          accept="application/pdf,.pdf,.md,.markdown,text/markdown,text/plain,.txt,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,image/*"
          multiple
          className="hidden"
          onChange={handleRootPick}
        />
      </div>

      <ManageFoldersDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        folders={allFolders.filter((f) => !f.parent_id)}
        onCreate={async (name) => {
          await createFolder(name, null);
        }}
        onRename={renameFolder}
        onDelete={deleteFolder}
      />


      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 overflow-x-auto text-xs scrollbar-none">
        <button
          type="button"
          onClick={() => setPath([])}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
            path.length === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Home className="h-3 w-3" /> My Library
        </button>
        {path.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setPath(path.slice(0, i + 1))}
              className={`max-w-[120px] truncate rounded-md px-2 py-1 ${
                i === path.length - 1
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              title={f.name}
            >
              {f.name}
            </button>
          </span>
        ))}
        {path.length > 0 && (
          <span className="ml-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" aria-label="Items in this folder">
            {visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}
          </span>
        )}
      </nav>

      <FolderGrid
        hideWhenEmpty={!!currentId}
        title={path.length ? "Folders" : "My folders"}
        folders={visibleFolders}
        onOpen={(f) => setPath([...path, f])}
        onCreate={async (name, color) => {
          await createFolder(name, currentId, color);
        }}
        onCreateInside={async (parentId, name, color) => {
          await createFolder(name, parentId, color);
        }}
        onRename={renameFolder}
        onDelete={deleteFolder}
        onMove={async (id, newParent) => {
          await moveFolder(id, newParent);
        }}
        onReorder={reorderFolder}
        moveTargets={allFolders}
      />

      {currentId && (
        <FolderView
          folder={path[path.length - 1]}
          allFolders={allFolders}
          onRefreshOuter={refresh}
          sort={sort}
          view="list"
        />
      )}

      {/* Links are ordinary library items now — added straight into a folder */}
      <AddFromLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        folders={allFolders}
        currentFolderId={currentId}
        onSaved={refresh}
        onRead={(l) => setLinkReader(l)}
      />




      {!path.length && allFolders.length === 0 && !query && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 px-6 py-10 text-center">
          {/* Gradient tile — reference: Notion / Linear empty collections */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
          <div className="relative">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <FolderIcon className="h-7 w-7" strokeWidth={2} />
            </div>
            <p className="text-base font-semibold text-foreground">Your library is empty</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground leading-relaxed">
              Create your first folder to organise PDFs, notes and scans. Files stay on this device — nothing is uploaded.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-5 h-9 px-5"
              onClick={() => setManageOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Create your first folder
            </Button>
          </div>
        </div>
      )}

      {!path.length && allFolders.length > 0 && !visibleFolders.length && query && (
        <p className="text-center text-xs text-muted-foreground px-4">
          No folders match "{query}".
        </p>
      )}

      {/* Centered split FAB — mirrors the Doc-Scanner "Camera | +" pill.
          Camera scans straight to the current folder; + opens the file picker. */}
      <div
        className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
        style={{ bottom: "calc(56px + 0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="pointer-events-auto inline-flex h-14 items-stretch overflow-hidden rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ring-1 ring-primary/30">
          <button
            type="button"
            onClick={handleCameraCapture}
            aria-label="Scan with camera"
            className="inline-flex w-20 items-center justify-center transition-colors active:bg-primary/80"
          >
            <Camera className="h-6 w-6" strokeWidth={2} />
          </button>
          <span aria-hidden className="my-3 w-px bg-primary-foreground/40" />
          <button
            type="button"
            onClick={() => rootFileRef.current?.click()}
            aria-label="Add files from device"
            className="inline-flex w-20 items-center justify-center transition-colors active:bg-primary/80"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
          <span aria-hidden className="my-3 w-px bg-primary-foreground/40" />
          <button
            type="button"
            onClick={() => setLinkDialogOpen(true)}
            aria-label="Add a PDF from a link"
            className="inline-flex w-20 items-center justify-center transition-colors active:bg-primary/80"
          >
            <Link2 className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
