import { useState } from "react";
import {
  useAllTestimonials,
  useCreateTestimonial,
  useUpdateTestimonial,
  useDeleteTestimonial,
  Testimonial,
  TestimonialInsert,
} from "@/hooks/useTestimonials";
import { importLandingCourseImageFromUrl } from "@/hooks/useLandingCourses";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Trash2, Pencil, Plus, X, Check, Link2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { getErrorMessage } from "@/lib/errorMessage";

const EMPTY: TestimonialInsert = {
  student_name: "",
  exam_track: "",
  quote: "",
  avatar_url: null,
  rating: 5,
  position: 0,
  is_active: true,
};

const TestimonialsManager = () => {
  const { data: items = [], isLoading } = useAllTestimonials();
  const create = useCreateTestimonial();
  const update = useUpdateTestimonial();
  const del = useDeleteTestimonial();
  const confirmAction = useConfirm();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<TestimonialInsert>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Testimonial>>({});
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const handleImport = async (target: "new" | "edit") => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const url = await importLandingCourseImageFromUrl(importUrl);
      if (target === "new") setDraft((d) => ({ ...d, avatar_url: url }));
      else setEditDraft((d) => ({ ...d, avatar_url: url }));
      setImportUrl("");
      toast.success("Image imported.");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const submitNew = async () => {
    if (!draft.student_name.trim() || !draft.quote.trim()) {
      toast.error("Name aur quote zaroori hai.");
      return;
    }
    await create.mutateAsync(draft);
    setDraft(EMPTY);
    setAdding(false);
  };

  const startEdit = (t: Testimonial) => {
    setEditingId(t.id);
    setEditDraft(t);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await update.mutateAsync({ id: editingId, ...editDraft });
    setEditingId(null);
    setEditDraft({});
  };

  const remove = async (t: Testimonial) => {
    const ok = await confirmAction({
      title: "Delete testimonial?",
      description: `Remove "${t.student_name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) await del.mutateAsync(t.id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5" /> Landing testimonials
        </CardTitle>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {adding ? "Cancel" : "Add"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {adding && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Student name *</Label>
                <Input value={draft.student_name} onChange={(e) => setDraft({ ...draft, student_name: e.target.value })} />
              </div>
              <div>
                <Label>Exam track</Label>
                <Input placeholder="UP Board, CBSE, CG Lecturer…" value={draft.exam_track ?? ""} onChange={(e) => setDraft({ ...draft, exam_track: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Quote *</Label>
              <Textarea rows={3} value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Rating (1-5)</Label>
                <Input type="number" min={1} max={5} value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Position</Label>
                <Input type="number" value={draft.position} onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} />
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
            </div>
            <div>
              <Label>Avatar image</Label>
              {draft.avatar_url && (
                <img src={draft.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover mb-2 border" />
              )}
              <div className="flex gap-2">
                <Input placeholder="https://…" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
                <Button type="button" size="sm" variant="outline" onClick={() => handleImport("new")} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Fetch
                </Button>
              </div>
            </div>
            <Button onClick={submitNew} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No testimonials yet. Add one above.</div>
        ) : (
          <div className="space-y-2">
            {items.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input value={editDraft.student_name ?? ""} onChange={(e) => setEditDraft({ ...editDraft, student_name: e.target.value })} placeholder="Name" />
                    <Input value={editDraft.exam_track ?? ""} onChange={(e) => setEditDraft({ ...editDraft, exam_track: e.target.value })} placeholder="Exam track" />
                  </div>
                  <Textarea rows={3} value={editDraft.quote ?? ""} onChange={(e) => setEditDraft({ ...editDraft, quote: e.target.value })} />
                  <div className="grid grid-cols-3 gap-3">
                    <Input type="number" min={1} max={5} value={editDraft.rating ?? 5} onChange={(e) => setEditDraft({ ...editDraft, rating: Number(e.target.value) })} />
                    <Input type="number" value={editDraft.position ?? 0} onChange={(e) => setEditDraft({ ...editDraft, position: Number(e.target.value) })} />
                    <div className="flex items-center gap-2">
                      <Switch checked={editDraft.is_active ?? true} onCheckedChange={(v) => setEditDraft({ ...editDraft, is_active: v })} />
                      <span className="text-sm">Active</span>
                    </div>
                  </div>
                  <div>
                    {editDraft.avatar_url && <img src={editDraft.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover mb-2 border" />}
                    <div className="flex gap-2">
                      <Input placeholder="https://…" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleImport("edit")} disabled={importing}>
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        Fetch
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4 mr-1" />Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditDraft({}); }}><X className="h-4 w-4 mr-1" />Cancel</Button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover border" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                      {t.student_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{t.student_name}</p>
                      {!t.is_active && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">hidden</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.exam_track} · {t.quote}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TestimonialsManager;
