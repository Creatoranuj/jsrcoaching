import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GraduationCap, Loader2, Search, UserCheck, UserX, Users } from "lucide-react";
import type { AdminUser } from "../lib/adminFilters";

// Teachers tab of the admin dashboard, lifted verbatim out of Admin.tsx.
// Purely presentational: role mutations and the search state stay in the page
// and arrive as props.

interface AdminTeachersTabProps {
  activeTeachers: AdminUser[];
  promotableStudents: AdminUser[];
  search: string;
  onSearchChange: (value: string) => void;
  roleChanging: Record<string, boolean>;
  onChangeRole: (userId: string, role: string) => void;
}

function AdminTeachersTabImpl({
  activeTeachers,
  promotableStudents,
  search,
  onSearchChange,
  roleChanging,
  onChangeRole,
}: AdminTeachersTabProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="border shadow-sm">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-emerald-700">
            <UserCheck className="h-5 w-5" /> Active Teachers ({activeTeachers.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">These users can access Students &amp; Attendance in the sidebar.</p>
        </CardHeader>
        <CardContent className="pt-4">
          {activeTeachers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No teachers assigned yet.</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] max-h-[60vh] pr-2">
              <div className="space-y-2">
                {activeTeachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/40 hover:bg-emerald-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-emerald-700 font-bold text-sm">{(teacher.full_name || teacher.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{teacher.full_name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 flex-shrink-0 ml-2"
                      disabled={roleChanging[teacher.id]}
                      onClick={() => onChangeRole(teacher.id, "student")}
                    >
                      {roleChanging[teacher.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><UserX className="h-3 w-3 mr-1" />Revoke</>}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-5 w-5" /> Assign Teacher Role
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search students by name or email..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {promotableStudents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? "No students match your search." : "No students available."}</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] max-h-[60vh] pr-2">
              <div className="space-y-2">
                {promotableStudents.map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-foreground font-bold text-sm">{(student.full_name || student.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{student.full_name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="flex-shrink-0 ml-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={roleChanging[student.id]}
                      onClick={() => onChangeRole(student.id, "teacher")}
                    >
                      {roleChanging[student.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><GraduationCap className="h-3 w-3 mr-1" />Make Teacher</>}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const AdminTeachersTab = memo(AdminTeachersTabImpl);
