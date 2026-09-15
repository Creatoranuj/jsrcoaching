import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { useSmartNotesList, type SmartNoteRow } from "../../hooks/useSmartNotesList";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId?: string | null;
  courseId?: number | null;
  /** Called when the user opens a note (to launch the fullscreen reader). */
  onOpenNote: (note: SmartNoteRow) => void;
  /** Fallback content to seed the first note (usually lesson.transcript_md). */
  seedContent?: string;
  /** Default title for the "New note" button. */
  defaultTitle?: string;
}

/**
 * Bottom-sheet picker for the user's personal Smart Notes on this lesson.
 * Supports create · rename · delete · open. Multiple notes per lesson.
 */
export default function SmartNotesListSheet({
  open, onOpenChange, lessonId, courseId, onOpenNote, seedContent, defaultTitle,
}: Props) {
  const { notes, loading, create, rename, remove } = useSmartNotesList({ lessonId, courseId });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const startRename = (n: SmartNoteRow) => {
    setEditingId(n.id);
    setEditValue(n.title);
  };
  const commitRename = async (n: SmartNoteRow) => {
    const next = editValue.trim();
    setEditingId(null);
    if (!next || next === n.title) return;
    try { await rename(n.id, next); toast.success("Renamed"); }
    catch { toast.error("Rename failed"); }
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const nextIndex = notes.length + 1;
      const title = `${defaultTitle || "My note"} ${nextIndex}`;
      const created = await create({ title, content_md: seedContent && notes.length === 0 ? seedContent : "" });
      if (created) { onOpenNote(created); onOpenChange(false); }
    } catch { toast.error("Could not create note"); }
    finally { setCreating(false); }
  };

  const handleDelete = async (n: SmartNoteRow) => {
    if (!window.confirm(`Delete "${n.title}"? This cannot be undone.`)) return;
    setBusyId(n.id);
    try { await remove(n.id); toast.success("Deleted"); }
    catch { toast.error("Delete failed"); }
    finally { setBusyId(null); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="safe-area-bottom max-h-[85dvh] rounded-t-2xl p-0">
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" /> My Smart Notes
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto px-3 py-3" style={{ maxHeight: "calc(85dvh - 56px)" }}>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="mb-3 h-11 w-full justify-start gap-2 rounded-xl"
            variant="secondary"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New note
          </Button>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : notes.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Abhi tak koi note nahi. Tap <b>New note</b> to create your first one.
            </div>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => {
                const isEditing = editingId === n.id;
                const preview = (n.content_md || "").replace(/[#*_>`[\]]/g, "").slice(0, 90).trim();
                return (
                  <li
                    key={n.id}
                    className="group flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:bg-accent/40"
                  >
                    <button
                      type="button"
                      onClick={() => !isEditing && (onOpenNote(n), onOpenChange(false))}
                      className="min-w-0 flex-1 text-left"
                      disabled={isEditing}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitRename(n);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-8 text-sm"
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); void commitRename(n); }}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-sm font-semibold">{n.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {preview || "Empty note"} · {new Date(n.updated_at).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </button>
                    {!isEditing && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); startRename(n); }}
                          aria-label="Rename"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); void handleDelete(n); }}
                          disabled={busyId === n.id}
                          aria-label="Delete"
                        >
                          {busyId === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
