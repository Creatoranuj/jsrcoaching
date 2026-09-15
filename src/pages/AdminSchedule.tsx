import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useLectureSchedules } from "../hooks/useLectureSchedules";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { supabase } from "../integrations/supabase/client";
import {
  ArrowLeft, Plus, Calendar, Clock, Trash2, Loader2, ExternalLink, Video, Pencil,
} from "lucide-react";
import { toast } from "sonner";

const AdminSchedule = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, isTeacher, profile } = useAuth();
  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule } = useLectureSchedules();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const emptyForm = { title: "", description: "", courseId: "", scheduledDate: "", scheduledTime: "", durationMinutes: "60", meetingLink: "" };
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const canManage = isAdmin || isTeacher;

  const loadCourses = async () => {
    const { data } = await supabase.from("courses").select("id, title");
    setCourses(data || []);
  };

  const handleEdit = (s: typeof schedules[number]) => {
    setEditingId(s.id);
    setShowCreate(true);
    loadCourses();
    setForm({
      title: s.title,
      description: s.description || "",
      courseId: s.courseId ? String(s.courseId) : "",
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      durationMinutes: String(s.durationMinutes || 60),
      meetingLink: s.meetingLink || "",
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowCreate(false);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.scheduledDate || !form.scheduledTime) {
      toast.error("Title, date and time are required");
      return;
    }
    setCreating(true);
    const payload = {
      title: form.title,
      description: form.description,
      courseId: form.courseId ? Number(form.courseId) : undefined,
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      durationMinutes: Number(form.durationMinutes) || 60,
      meetingLink: form.meetingLink,
    };
    const success = editingId
      ? await updateSchedule(editingId, payload)
      : await createSchedule(payload);
    setCreating(false);
    if (success) resetForm();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };

  const isPast = (d: string, t: string) => new Date(`${d}T${t}`) < new Date();

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "Admin"} />

      <div className="bg-primary px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-primary-foreground hover:bg-primary-foreground/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-primary-foreground">Lectures Schedule</h1>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => { resetForm(); setShowCreate(true); loadCourses(); }}>
            <Plus className="h-4 w-4 mr-2" /> New Schedule
          </Button>
        )}
      </div>

      <main className="flex-1 p-4 space-y-4 max-w-4xl mx-auto w-full">
        {showCreate && canManage && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> {editingId ? "Edit Lecture" : "Schedule a Lecture"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Lecture Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Time</label>
                  <Input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Duration (mins)</label>
                  <Input type="number" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Course (optional)</label>
                  <Select value={form.courseId} onValueChange={v => setForm({ ...form, courseId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Input placeholder="Meeting link (optional)" value={form.meetingLink} onChange={e => setForm({ ...form, meetingLink: e.target.value })} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetForm} className="flex-1">Cancel</Button>
                <Button onClick={handleSubmit} disabled={creating} className="flex-1">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? "Update" : "Create")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
        ) : schedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No lectures scheduled yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => (
              <Card key={s.id} className={isPast(s.scheduledDate, s.scheduledTime) ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Video className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">{s.title}</h3>
                        {isPast(s.scheduledDate, s.scheduledTime) && <Badge variant="outline" className="text-xs">Past</Badge>}
                      </div>
                      {s.description && <p className="text-sm text-muted-foreground mb-2">{s.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(s.scheduledDate)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(s.scheduledTime)}</span>
                        {s.durationMinutes && <span>{s.durationMinutes} min</span>}
                        {s.courseName && <Badge variant="outline" className="text-[10px]">{s.courseName}</Badge>}
                      </div>
                      {s.meetingLink && (
                        <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-2 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Join Meeting
                        </a>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteSchedule(s.id)} className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminSchedule;
