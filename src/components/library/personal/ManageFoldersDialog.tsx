import { useState } from "react";
import { Folder, Pencil, Trash2 } from "lucide-react";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useConfirm } from "../../admin/ConfirmDialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: PersonalFolder[];
  onCreate: (name: string) => Promise<void> | void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

/**
 * Minimal "Manage Folders" modal (screenshot-inspired): lists root folders
 * with hover edit/delete affordances and an inline "Add Folder" row.
 * Everything stays in-app; no external surfaces.
 */
export default function ManageFoldersDialog({
  open,
  onOpenChange,
  folders,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const commitRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    try {
      setBusy(true);
      await onRename(id, name);
    } catch (e) {
      toast.error((e as Error)?.message || "Rename failed");
    } finally {
      setBusy(false);
      setEditingId(null);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setBusy(true);
      await onCreate(name);
      setNewName("");
    } catch (e) {
      toast.error((e as Error)?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (f: PersonalFolder) => {
    const ok = await confirm({
      title: `Delete "${f.name}"?`,
      description: "This folder and every subfolder and PDF inside it will be permanently removed from this device.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      setBusy(true);
      await onDelete(f.id);
      toast.success(`Deleted "${f.name}"`);
    } catch (e) {
      toast.error((e as Error)?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Manage Folders
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {folders.length === 0 && (
            <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              No folders yet. Create one below.
            </p>
          )}
          {folders.map((f) => {
            const isEditing = editingId === f.id;
            const showActions = hoverId === f.id || isEditing;
            return (
              <div
                key={f.id}
                onMouseEnter={() => setHoverId(f.id)}
                onMouseLeave={() => setHoverId((id) => (id === f.id ? null : id))}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-3"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                {isEditing ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(f.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 flex-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(f.id);
                      setEditingName(f.name);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                  >
                    {f.name}
                  </button>
                )}
                <div
                  className={`flex items-center gap-1 transition-opacity ${
                    showActions ? "opacity-100" : "opacity-60"
                  }`}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(f.id);
                      setEditingName(f.name);
                    }}
                    aria-label={`Rename ${f.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => handleDelete(f)}
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="New folder name…"
            className="h-10 flex-1"
          />
          <Button
            type="button"
            onClick={handleAdd}
            disabled={busy || !newName.trim()}
            className="h-10 px-5"
          >
            Add Folder
          </Button>
        </div>

        {/* DialogContent renders its own accessible close button; no custom X here. */}
      </DialogContent>
    </Dialog>
  );
}
