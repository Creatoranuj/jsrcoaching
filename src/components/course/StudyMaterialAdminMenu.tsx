import { useState } from "react";
import { MoreVertical, Pencil, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  deleteStudyMaterial, updateStudyMaterial, replaceStudyMaterialFile,
  type StudyMaterial,
} from "@/hooks/useStudyMaterials";

const MAX_BYTES = 20 * 1024 * 1024;

interface Props {
  material: StudyMaterial;
  chapters: { id: string; title: string }[];
}

/**
 * Overflow menu (⋯) with Edit + Delete for study materials. Rendered inline
 * on the student list for admins/teachers so they don't have to jump into
 * the `/admin/study-materials` page to fix a typo or replace a file.
 */
export default function StudyMaterialAdminMenu({ material, chapters }: Props) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? "");
  const [chapterId, setChapterId] = useState<string>(material.chapter_id ?? "");
  const [externalUrl, setExternalUrl] = useState(material.external_url ?? "");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const openEdit = () => {
    setTitle(material.title);
    setDescription(material.description ?? "");
    setChapterId(material.chapter_id ?? "");
    setExternalUrl(material.external_url ?? "");
    setReplaceFile(null);
    setEditOpen(true);
  };

  async function handleSave() {
    if (!title.trim()) return toast.error("Title is required");
    if (material.kind === "link" && externalUrl && !/^https?:\/\//i.test(externalUrl.trim())) {
      return toast.error("Link must start with http:// or https://");
    }
    if (replaceFile && replaceFile.size > MAX_BYTES) {
      return toast.error("File too large (max 20MB)");
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        chapter_id: chapterId || null,
      };
      if (material.kind === "link") {
        patch.external_url = externalUrl.trim() || null;
      }
      if (replaceFile && material.kind !== "link") {
        const info = await replaceStudyMaterialFile(material, replaceFile);
        Object.assign(patch, info);
      }
      await updateStudyMaterial(material.id, patch);
      toast.success("Updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["study-materials", material.course_id] });
    } catch (err) {
      toast.error((err as Error)?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteStudyMaterial(material);
      toast.success("Deleted");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["study-materials", material.course_id] });
    } catch (err) {
      toast.error((err as Error)?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label="Manage material"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-muted/60 hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => openEdit()}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input className="text-base" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="text-base" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Chapter</Label>
              <Select value={chapterId || "__batch"} onValueChange={(v) => setChapterId(v === "__batch" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Batch-wide" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__batch">Batch-wide (all chapters)</SelectItem>
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {material.kind === "link" ? (
              <div>
                <Label>External URL</Label>
                <Input
                  className="text-base"
                  type="url"
                  inputMode="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <Label>Replace file (optional, max 20MB)</Label>
                <Input
                  className="text-base"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/jpeg,image/png,image/webp"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                />
                {replaceFile && (
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">New: {replaceFile.name}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> Save</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{material.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the material for every student. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}