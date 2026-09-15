import { useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { useConfirm } from "@/components/admin/ConfirmDialog";

interface SyllabusEntry {
  id: string;
  course_id: number;
  title: string;
  description: string | null;
  week_number: number | null;
  topics: string[] | null;
  created_at: string;
  courseTitle?: string;
}

const SyllabusManager = () => {
  const confirmAction = useConfirm();
  const [entries, setEntries] = useState<SyllabusEntry[]>([]);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    courseId: "",
    weekNumber: "",
    topicsText: "", // comma-separated
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: syllabusData }, { data: coursesData }] = await Promise.all([
      supabase.from("syllabus").select("*, courses:course_id(title)").order("week_number", { ascending: true }),
      supabase.from("courses").select("id, title"),
    ]);
    setEntries((syllabusData || []).map((s) => ({ ...s, courseTitle: s.courses?.title })));
    setCourses(coursesData || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title || !form.courseId) {
      toast.error("Title and Course are required");
      return;
    }
    setCreating(true);
    const topics = form.topicsText.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("syllabus").insert({
      title: form.title,
      description: form.description || null,
      course_id: Number(form.courseId),
      week_number: form.weekNumber ? Number(form.weekNumber) : null,
      topics: topics.length > 0 ? topics : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Syllabus entry added!");
      setForm({ title: "", description: "", courseId: "", weekNumber: "", topicsText: "" });
      setShowForm(false);
      fetchAll();
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this syllabus entry?", variant: "destructive" }))) return;
    const { error } = await supabase.from("syllabus").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAll(); }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Syllabus Manager ({entries.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {showForm && (
          <div className="p-4 border rounded-xl bg-muted/30 space-y-3">
            <Input placeholder="Title (e.g. Thermodynamics)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.courseId} onValueChange={v => setForm({ ...form, courseId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Course" /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Week #" value={form.weekNumber} onChange={e => setForm({ ...form, weekNumber: e.target.value })} />
            </div>
            <Input placeholder="Topics (comma-separated)" value={form.topicsText} onChange={e => setForm({ ...form, topicsText: e.target.value })} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleCreate} disabled={creating} className="flex-1">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No syllabus entries yet. Click "Add Entry" to create one.</p>
        ) : (
          <div className="space-y-3">
            {entries.map(e => (
              <div key={e.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{e.title}</span>
                    {e.week_number && <Badge variant="outline" className="text-xs">Week {e.week_number}</Badge>}
                    {e.courseTitle && <Badge variant="secondary" className="text-xs">{e.courseTitle}</Badge>}
                  </div>
                  {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
                  {e.topics && e.topics.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {e.topics.map((t, i) => <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SyllabusManager;
