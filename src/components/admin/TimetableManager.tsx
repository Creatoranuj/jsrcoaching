import { useState, useEffect } from "react";
import { useTimetable, DAY_NAMES, TimetableEntryWithCourse } from "../../hooks/useTimetable";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Clock } from "lucide-react";
import { useConfirm } from "@/components/admin/ConfirmDialog";

const TimetableManager = () => {
  const confirmAction = useConfirm();
  const { timetable, loading, createEntry, deleteEntry, fetchTimetable } = useTimetable();
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    courseId: "",
    dayOfWeek: "1", // Monday
    startTime: "09:00",
    endTime: "10:00",
    room: "",
  });

  useEffect(() => {
    let cancelled = false;
    supabase.from("courses").select("id, title").then(({ data }) => {
      if (cancelled) return;
      setCourses(data || []);
    });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    if (!form.courseId || !form.startTime || !form.endTime) {
      toast.error("Course, start time and end time are required");
      return;
    }
    setCreating(true);
    const success = await createEntry({
      courseId: Number(form.courseId),
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room || undefined,
    });
    if (success) {
      setForm({ courseId: "", dayOfWeek: "1", startTime: "09:00", endTime: "10:00", room: "" });
      setShowForm(false);
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this timetable entry?", variant: "destructive" }))) return;
    await deleteEntry(id);
  };

  // Group by day
  const grouped = DAY_NAMES.map((name, idx) => ({
    name,
    entries: timetable.filter(e => e.dayOfWeek === idx),
  })).filter(g => g.entries.length > 0);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Timetable Manager ({timetable.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Slot
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {showForm && (
          <div className="p-4 border rounded-xl bg-muted/30 space-y-3">
            <Select value={form.courseId} onValueChange={v => setForm({ ...form, courseId: v })}>
              <SelectTrigger><SelectValue placeholder="Select Course" /></SelectTrigger>
              <SelectContent>
                {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.dayOfWeek} onValueChange={v => setForm({ ...form, dayOfWeek: v })}>
              <SelectTrigger><SelectValue placeholder="Day of Week" /></SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((name, idx) => <SelectItem key={idx} value={String(idx)}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                <Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End Time</label>
                <Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <Input placeholder="Room (optional)" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} />
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
        ) : timetable.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No timetable entries yet.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(g => (
              <div key={g.name}>
                <h3 className="font-semibold text-sm text-muted-foreground mb-2">{g.name}</h3>
                <div className="space-y-2">
                  {g.entries.map(e => (
                    <div key={e.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{e.course?.title || "Unknown"}</span>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{e.startTime} – {e.endTime}</span>
                          {e.room && <Badge variant="outline" className="text-[10px]">{e.room}</Badge>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} className="text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimetableManager;
