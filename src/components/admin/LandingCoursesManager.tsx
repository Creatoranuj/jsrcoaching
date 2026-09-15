import { useState } from "react";
import {
  useAllLandingCourses,
  useCreateLandingCourse,
  useUpdateLandingCourse,
  useDeleteLandingCourse,
  importLandingCourseImageFromUrl,
  LandingCourse,
  LandingCourseInsert,
} from "@/hooks/useLandingCourses";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Trash2, Pencil, Plus, X, Check, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { getErrorMessage } from "@/lib/errorMessage";

const EMPTY: LandingCourseInsert = {
  slug: "",
  badge: "",
  title: "",
  faculty: "Ramchandra Sir",
  language: "Hindi medium friendly",
  duration: "",
  start_date: "",
  seats: null,
  price_mrp: null,
  price_effective: null,
  short: "",
  image_url: null,
  route: null,
  course_id: null,
  position: 0,
  is_active: true,
};

export default function LandingCoursesManager() {
  const { data: rows = [], isLoading } = useAllLandingCourses();
  const create = useCreateLandingCourse();
  const update = useUpdateLandingCourse();
  const del = useDeleteLandingCourse();
  const confirmAction = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<LandingCourseInsert>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LandingCourse>>({});
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!form.slug || !form.title) return toast.error("Slug & title required");
    await create.mutateAsync({ ...form, position: rows.length });
    setForm(EMPTY);
    setShowAdd(false);
  };

  const handleImport = async (targetId: string | null) => {
    if (!/^https:\/\//i.test(importUrl.trim())) return toast.error("https:// URL required");
    setImporting(true);
    try {
      const uri = await importLandingCourseImageFromUrl(importUrl.trim());
      if (targetId) {
        await update.mutateAsync({ id: targetId, image_url: uri });
      } else {
        setForm((f) => ({ ...f, image_url: uri }));
      }
      setImportUrl("");
      setImportTargetId(null);
      toast.success("Image imported.");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const startEdit = (r: LandingCourse) => {
    setEditingId(r.id);
    setEditForm(r);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { id: _id, created_at, updated_at, ...rest } = editForm as any;
    await update.mutateAsync({ id: editingId, ...rest });
    setEditingId(null);
    setEditForm({});
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Landing page — Courses</CardTitle>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {showAdd ? "Cancel" : "Add course"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Slug (unique)"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="up-board" /></Field>
              <Field label="Badge"><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="UP Board" /></Field>
              <Field label="Title" className="md:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Faculty"><Input value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} /></Field>
              <Field label="Language"><Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></Field>
              <Field label="Duration"><Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="9 months · 220+ lessons" /></Field>
              <Field label="Start date"><Input value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} placeholder="Naya batch: 5 Aug 2026" /></Field>
              <Field label="Seats"><Input value={form.seats ?? ""} onChange={(e) => setForm({ ...form, seats: e.target.value || null })} placeholder="40 seats left" /></Field>
              <Field label="Route (SEO landing)"><Input value={form.route ?? ""} onChange={(e) => setForm({ ...form, route: e.target.value || null })} placeholder="/up-board-english" /></Field>
              <Field label="Price MRP"><Input type="number" value={form.price_mrp ?? ""} onChange={(e) => setForm({ ...form, price_mrp: e.target.value ? +e.target.value : null })} /></Field>
              <Field label="Price effective"><Input type="number" value={form.price_effective ?? ""} onChange={(e) => setForm({ ...form, price_effective: e.target.value ? +e.target.value : null })} /></Field>
              <Field label="Course ID (link to real course)"><Input type="number" value={form.course_id ?? ""} onChange={(e) => setForm({ ...form, course_id: e.target.value ? +e.target.value : null })} /></Field>
              <Field label="Short description" className="md:col-span-2"><Textarea rows={2} value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} /></Field>
              <Field label="Image URL (or import)" className="md:col-span-2">
                <div className="flex gap-2">
                  <Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value || null })} placeholder="https://... or storage://..." />
                </div>
                <div className="flex gap-2 mt-2">
                  <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="Paste https:// image URL to fetch & save" />
                  <Button type="button" variant="outline" size="sm" onClick={() => handleImport(null)} disabled={importing}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Link2 className="h-4 w-4 mr-1" />Fetch</>}
                  </Button>
                </div>
              </Field>
              <div className="flex items-center gap-2 md:col-span-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={create.isPending}><Check className="h-4 w-4 mr-1" />Save course</Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No courses yet. Add one above.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3">
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input value={editForm.badge ?? ""} onChange={(e) => setEditForm({ ...editForm, badge: e.target.value })} placeholder="Badge" />
                      <Input value={editForm.title ?? ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" />
                      <Input value={editForm.duration ?? ""} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} placeholder="Duration" />
                      <Input value={editForm.start_date ?? ""} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} placeholder="Start date" />
                      <Input value={editForm.seats ?? ""} onChange={(e) => setEditForm({ ...editForm, seats: e.target.value || null })} placeholder="Seats" />
                      <Input value={editForm.route ?? ""} onChange={(e) => setEditForm({ ...editForm, route: e.target.value || null })} placeholder="Route" />
                      <Input type="number" value={editForm.price_mrp ?? ""} onChange={(e) => setEditForm({ ...editForm, price_mrp: e.target.value ? +e.target.value : null })} placeholder="MRP" />
                      <Input type="number" value={editForm.price_effective ?? ""} onChange={(e) => setEditForm({ ...editForm, price_effective: e.target.value ? +e.target.value : null })} placeholder="Effective" />
                      <Input type="number" value={editForm.course_id ?? ""} onChange={(e) => setEditForm({ ...editForm, course_id: e.target.value ? +e.target.value : null })} placeholder="Course ID" />
                      <Input type="number" value={editForm.position ?? 0} onChange={(e) => setEditForm({ ...editForm, position: +e.target.value })} placeholder="Position" />
                    </div>
                    <Textarea rows={2} value={editForm.short ?? ""} onChange={(e) => setEditForm({ ...editForm, short: e.target.value })} />
                    <Input value={editForm.image_url ?? ""} onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value || null })} placeholder="Image URL" />
                    <div className="flex gap-2">
                      <Input value={importTargetId === r.id ? importUrl : ""} onFocus={() => setImportTargetId(r.id)} onChange={(e) => setImportUrl(e.target.value)} placeholder="Import from https:// URL" />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleImport(r.id)} disabled={importing}>
                        {importing && importTargetId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={editForm.is_active ?? true} onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })} />
                      <Label>Active</Label>
                      <div className="flex-1" />
                      <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4 mr-1" />Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm({}); }}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{r.badge}</Badge>
                        {!r.is_active && <Badge variant="secondary">Hidden</Badge>}
                        {r.course_id && <Badge variant="outline">→ course #{r.course_id}</Badge>}
                        <span className="text-xs text-muted-foreground">pos {r.position}</span>
                      </div>
                      <h4 className="font-semibold mt-1">{r.title}</h4>
                      <p className="text-xs text-muted-foreground">{r.faculty} · {r.duration} · {r.start_date}</p>
                      {r.price_effective && <p className="text-sm mt-1">₹{r.price_effective} {r.price_mrp && <span className="text-muted-foreground line-through">₹{r.price_mrp}</span>}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        const ok = await confirmAction({ title: "Delete course?", description: r.title, confirmLabel: "Delete", variant: "destructive" });
                        if (ok) del.mutate(r.id);
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}>
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);
