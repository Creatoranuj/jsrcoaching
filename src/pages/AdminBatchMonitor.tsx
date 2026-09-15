/**
 * AdminBatchMonitor — batch-wise view of who bought which course, with
 * per-student batch removal and lesson-comment moderation for that batch.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { GraduationCap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import BatchRosterTable, { type RosterRow } from "../components/admin/BatchRosterTable";
import BatchCommentsPanel from "../components/admin/BatchCommentsPanel";

interface BatchOption { id: number; title: string; count: number }

const AdminBatchMonitor = () => {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/admin/login");
  }, [authLoading, isAdmin, navigate]);

  const fetchBatches = useCallback(async () => {
    const [{ data: courses }, { data: enrollments }] = await Promise.all([
      supabase.from("courses").select("id, title").order("id", { ascending: false }),
      supabase.from("enrollments").select("course_id"),
    ]);
    const counts: Record<number, number> = {};
    (enrollments ?? []).forEach((e) => { counts[e.course_id] = (counts[e.course_id] ?? 0) + 1; });
    const list = (courses ?? []).map((c) => ({
      id: c.id as number, title: c.title as string, count: counts[c.id] ?? 0,
    }));
    setBatches(list);
    setCourseId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  const fetchRoster = useCallback(async (id: number) => {
    setLoading(true);
    setRows([]);
    const { data, error } = await supabase.rpc("admin_get_batch_roster", { _course_id: id });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as RosterRow[]);
  }, []);

  useEffect(() => { if (isAdmin) fetchBatches(); }, [isAdmin, fetchBatches]);
  useEffect(() => { if (isAdmin && courseId != null) fetchRoster(courseId); }, [isAdmin, courseId, fetchRoster]);

  const refresh = () => { fetchBatches(); if (courseId != null) fetchRoster(courseId); };

  if (authLoading) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-dvh">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" /> Batch Monitor
            </h1>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setCourseId(b.id)}
                className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                  courseId === b.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                {b.title}
                <Badge
                  variant={courseId === b.id ? "secondary" : "outline"}
                  className="ml-2 text-[10px]"
                >{b.count}</Badge>
              </button>
            ))}
            {batches.length === 0 && (
              <p className="text-sm text-muted-foreground">Koi course nahi mila.</p>
            )}
          </div>

          <Tabs defaultValue="students">
            <TabsList>
              <TabsTrigger value="students">Students ({rows.length})</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>

            <TabsContent value="students" className="mt-4 space-y-3">
              <BatchRosterTable
                rows={rows}
                loading={loading}
                onChanged={() => courseId != null && fetchRoster(courseId)}
              />
            </TabsContent>

            <TabsContent value="comments" className="mt-4">
              {courseId != null && <BatchCommentsPanel key={courseId} courseId={courseId} />}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default AdminBatchMonitor;
