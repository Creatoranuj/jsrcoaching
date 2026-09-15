/**
 * EnrollmentManager — manual course-access grant / revoke for admins.
 *
 * Extracted from Admin.tsx (was inline 49–161) to keep the page leaner and
 * unlock React.memo so it doesn't re-render every time the parent admin
 * state ticks. Behavior is unchanged.
 */
import { memo, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { List, type RowComponentProps } from "react-window";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { useConfirm } from "./ConfirmDialog";

interface UserWithRole {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string | null;
  role: string | null;
}

interface Props {
  coursesList: any[];
  usersList: UserWithRole[];
}

const EnrollmentManagerImpl = ({ coursesList, usersList }: Props) => {
  const confirmAction = useConfirm();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [enrollSearch, setEnrollSearch] = useState("");
  const [granting, setGranting] = useState(false);

  const fetchEnrollments = async () => {
    setEnrollLoading(true);
    // profiles is not FK-linked to enrollments — join client-side.
    const { data } = await supabase
      .from("enrollments")
      .select("*, courses(title)")
      .order("purchased_at", { ascending: false })
      .limit(200);
    const userIds = Array.from(new Set((data || []).map((e) => e.user_id).filter(Boolean)));
    const profileMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profs || []).forEach((p) => profileMap.set(p.id, p));
    }
    setEnrollments((data || []).map((e) => ({ ...e, profiles: profileMap.get(e.user_id) ?? null })));
    setEnrollLoading(false);
  };

  useEffect(() => { fetchEnrollments(); }, []);

  const handleGrant = async () => {
    if (!selectedUserId || !selectedCourseId) {
      toast.error("Select both a student and a course"); return;
    }
    setGranting(true);
    const { error } = await supabase.from("enrollments").upsert(
      { user_id: selectedUserId, course_id: Number(selectedCourseId), status: "active" },
      { onConflict: "user_id,course_id", ignoreDuplicates: false }
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Course access granted!");
      fetchEnrollments();
      setSelectedUserId(""); setSelectedCourseId("");
    }
    setGranting(false);
  };

  const handleRevoke = async (id: number) => {
    if (!(await confirmAction({ title: "Revoke this enrollment?", variant: "destructive" }))) return;
    const { error } = await supabase.from("enrollments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Enrollment revoked"); fetchEnrollments(); }
  };

  const filteredEnrollments = enrollments.filter(e => {
    if (!enrollSearch) return true;
    const s = enrollSearch.toLowerCase();
    return e.profiles?.full_name?.toLowerCase().includes(s)
      || e.profiles?.email?.toLowerCase().includes(s)
      || e.courses?.title?.toLowerCase().includes(s);
  });

  const matchedStudents = usersList.filter(u =>
    (u.role === "student" || !u.role) &&
    (u.full_name?.toLowerCase().includes(enrollSearch.toLowerCase())
      || u.email?.toLowerCase().includes(enrollSearch.toLowerCase()))
  ).slice(0, 50);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" /> Manual Enrollment ({filteredEnrollments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="p-4 border rounded-xl bg-muted/30 space-y-3">
          <h3 className="text-sm font-semibold">Grant Course Access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Select Student" /></SelectTrigger>
              <SelectContent>
                {matchedStudents.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger><SelectValue placeholder="Select Course" /></SelectTrigger>
              <SelectContent>
                {coursesList.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGrant} disabled={granting} className="min-h-[44px]">
              {granting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Grant Access
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search enrollments..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="h-[400px]">
          {enrollLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredEnrollments.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No enrollments found</p>
          ) : (
            // perf-exam-ready Lane 3 #3: virtualize — admins with 200+
            // active enrollments used to render every row on tab open.
            <List
              rowCount={filteredEnrollments.length}
              rowHeight={64}
              rowComponent={EnrollmentRow}
              rowProps={{ enrollments: filteredEnrollments, onRevoke: handleRevoke }}
              style={{ height: "100%" }}
              overscanCount={4}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

type EnrollmentRowProps = {
  enrollments: any[];
  onRevoke: (id: number) => void;
};

const EnrollmentRow = ({ index, style, enrollments, onRevoke }: RowComponentProps<EnrollmentRowProps>) => {
  const e = enrollments[index];
  if (!e) return null;
  return (
    <div style={style} className="flex items-center justify-between p-3 hover:bg-muted/30 border-b">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{e.profiles?.full_name || "Unknown"}</p>
        <p className="text-xs text-muted-foreground truncate">{e.courses?.title || "Course #" + e.course_id} · {e.status}</p>
      </div>
      <Button variant="outline" size="sm" className="text-destructive border-destructive/20 shrink-0" onClick={() => onRevoke(e.id)}>
        <Trash2 className="h-3 w-3 mr-1" />Revoke
      </Button>
    </div>
  );
};

/**
 * Memoized: parent (Admin.tsx) re-renders on every tab change / fetch tick,
 * but this component only depends on `coursesList` and `usersList`.
 */
const EnrollmentManager = memo(EnrollmentManagerImpl);
export default EnrollmentManager;
