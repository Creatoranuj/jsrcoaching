import { useEffect, useState } from "react";
import { Folder, Plus, MoreVertical, Pencil, Trash2, FolderInput, FolderPlus, ChevronUp, ChevronDown } from "lucide-react";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { itemDB } from "../../../lib/personalLibraryDB";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import FolderNameDialog from "./FolderNameDialog";
import MoveTargetDialog from "./MoveTargetDialog";
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

interface Props {
  title?: string;
  folders: PersonalFolder[];
  view?: "grid" | "list";
  onOpen: (folder: PersonalFolder) => void;
  /** Creates at the current level. */
  onCreate: (name: string, color: string | null) => Promise<void> | void;
  /** Creates a subfolder inside the given parent. */
  onCreateInside?: (
    parentId: string,
    name: string,
    color: string | null
  ) => Promise<void> | void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onMove?: (id: string, newParentId: string | null) => Promise<void> | void;
  onReorder?: (id: string, dir: "up" | "down") => Promise<void> | void;
  moveTargets?: PersonalFolder[];
  /** Doc-Scanner style: when true and folders is empty, render nothing
   *  (no header, no empty card). Used inside a folder so only Documents shows. */
  hideWhenEmpty?: boolean;
}

const DEFAULT_FOLDER_COLOR = "hsl(210 60% 18%)";

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

export default function FolderGrid({
  title = "My folders",
  folders,
  onOpen,
  onCreate,
  onCreateInside,
  onRename,
  onDelete,
  onMove,
  onReorder,
  moveTargets = [],
  hideWhenEmpty = false,
}: Props) {
  const [newOpen, setNewOpen] = useState(false);

  const [renameTarget, setRenameTarget] = useState<PersonalFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersonalFolder | null>(null);
  const [moveTarget, setMoveTarget] = useState<PersonalFolder | null>(null);
  const [subfolderTarget, setSubfolderTarget] = useState<PersonalFolder | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Compute item counts (direct children only) for each folder shown.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await itemDB.all();
        if (!alive) return;
        const tally: Record<string, number> = {};
        for (const it of all) {
          tally[it.folder_id] = (tally[it.folder_id] || 0) + 1;
        }
        // Also add subfolder counts so the chip reflects total children
        // (subfolders + items) like the reference UI does.
        for (const f of moveTargets) {
          if (f.parent_id) {
            tally[f.parent_id] = (tally[f.parent_id] || 0) + 1;
          }
        }
        setCounts(tally);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [folders, moveTargets]);

  // Early return lives below the hooks so hook order stays stable across renders.
  if (hideWhenEmpty && folders.length === 0) return null;



  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">
          {title}{" "}
          <span className="text-muted-foreground font-normal">
            ({folders.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          aria-label="New folder"
          className="h-9 w-9 rounded-lg border border-border bg-card hover:bg-accent/40 inline-flex items-center justify-center text-foreground transition-colors shadow-sm"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
            <Folder className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">No folders here yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tap the <Plus className="inline h-3 w-3 -mt-0.5" /> to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((f, i) => {
            const count = counts[f.id] || 0;
            const tint = f.color || DEFAULT_FOLDER_COLOR;
            return (
            <div
              key={f.id}
              className="relative flex items-center gap-3 rounded-xl border bg-card px-3 py-3 hover:bg-accent/5 transition-colors shadow-sm"
            >
              <button
                className="flex flex-1 items-center gap-3 text-left min-w-0"
                onClick={() => onOpen(f)}
              >
                <div
                  className="h-12 w-14 shrink-0 rounded-md flex items-center justify-center shadow-inner"
                  style={{ backgroundColor: tint }}
                >
                  <Folder className="h-6 w-6 text-white fill-white/10" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground truncate leading-tight">
                    {f.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{fmtDate(f.created_at)}</span>
                    <span className="inline-flex min-w-[28px] justify-center items-center px-1.5 h-5 rounded-md border border-border text-[11px] font-medium text-foreground/80">
                      {count}
                    </span>
                  </div>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Folder options"
                    className="min-h-11 min-w-11 shrink-0 text-muted-foreground"
                  >

                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onCreateInside && (
                    <DropdownMenuItem onClick={() => setSubfolderTarget(f)}>
                      <FolderPlus className="h-4 w-4 mr-2" /> New subfolder
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setRenameTarget(f)}>
                    <Pencil className="h-4 w-4 mr-2" /> Rename
                  </DropdownMenuItem>
                  {onMove && (
                    <DropdownMenuItem onClick={() => setMoveTarget(f)}>
                      <FolderInput className="h-4 w-4 mr-2" /> Move to…
                    </DropdownMenuItem>
                  )}
                  {onReorder && (
                    <>
                      <DropdownMenuItem
                        disabled={i === 0}
                        onClick={() => onReorder(f.id, "up")}
                      >
                        <ChevronUp className="h-4 w-4 mr-2" /> Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={i === folders.length - 1}
                        onClick={() => onReorder(f.id, "down")}
                      >
                        <ChevronDown className="h-4 w-4 mr-2" /> Move down
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteTarget(f)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            );
          })}
        </div>
      )}

      <FolderNameDialog
        open={newOpen}
        title="Create Folder"
        onCancel={() => setNewOpen(false)}
        onConfirm={async (name, color) => {
          setNewOpen(false);
          await onCreate(name, color);
        }}
      />

      <FolderNameDialog
        open={!!subfolderTarget}
        title={`New subfolder in "${subfolderTarget?.name ?? ""}"`}
        onCancel={() => setSubfolderTarget(null)}
        onConfirm={async (name, color) => {
          const t = subfolderTarget;
          setSubfolderTarget(null);
          if (t && onCreateInside) await onCreateInside(t.id, name, color);
        }}
      />

      <FolderNameDialog
        open={!!renameTarget}
        title="Rename folder"
        initialName={renameTarget?.name || ""}
        initialColor={renameTarget?.color || null}
        confirmLabel="Save"
        onCancel={() => setRenameTarget(null)}
        onConfirm={async (name) => {
          const t = renameTarget;
          setRenameTarget(null);
          if (t) await onRename(t.id, name);
        }}
      />

      {onMove && (
        <MoveTargetDialog
          open={!!moveTarget}
          title={`Move "${moveTarget?.name ?? ""}" to…`}
          folders={moveTargets.filter((f) => f.id !== moveTarget?.id)}
          excludeDescendantsOf={moveTarget?.id}
          allowRoot
          onCancel={() => setMoveTarget(null)}
          onConfirm={async (newParentId) => {
            const t = moveTarget;
            setMoveTarget(null);
            if (t) await onMove(t.id, newParentId);
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" and everything inside it (subfolders + PDFs)
              will be permanently removed from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                const t = deleteTarget;
                setDeleteTarget(null);
                if (t) await onDelete(t.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
