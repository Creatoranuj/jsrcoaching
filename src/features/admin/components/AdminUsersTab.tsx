import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, Search, Filter, Download } from "lucide-react";
import type { AdminUser, UserRoleFilter } from "../lib/adminFilters";

// Users tab of the admin dashboard, lifted verbatim out of Admin.tsx.
// It is purely presentational: search/filter state and the role-change and
// export side effects stay in the page and arrive as props.

interface AdminUsersTabProps {
  totalUsers: number;
  users: AdminUser[];
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: UserRoleFilter;
  onRoleFilterChange: (value: UserRoleFilter) => void;
  roleChanging: Record<string, boolean>;
  onChangeRole: (userId: string, role: string) => void;
  onExport: () => void;
}

function AdminUsersTabImpl({
  totalUsers,
  users,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roleChanging,
  onChangeRole,
  onExport,
}: AdminUsersTabProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="bg-blue-50/50 border-b pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Users className="h-5 w-5" /> Registered Users ({totalUsers})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v: any) => onRoleFilterChange(v)}>
              <SelectTrigger className="w-[130px] bg-card">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px] max-h-[calc(100dvh-260px)]">
          {users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-blue-500 mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground">No users found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="p-4 md:p-5 hover:bg-muted/40 transition-colors flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
                    {u.full_name?.charAt(0)?.toUpperCase() || u.email?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate text-sm">{u.full_name || "Unnamed User"}</h3>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    {u.mobile && <p className="text-xs text-muted-foreground/70">{u.mobile}</p>}
                  </div>
                  <div className="shrink-0">
                    <Select
                      value={u.role || "student"}
                      onValueChange={(v) => onChangeRole(u.id, v)}
                      disabled={roleChanging[u.id]}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        {roleChanging[u.id] ? <span className="text-muted-foreground">Saving…</span> : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-right text-xs text-muted-foreground hidden md:block shrink-0">
                    <p>Joined</p>
                    <p className="font-medium text-foreground/70">
                      {new Date(u.created_at!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export const AdminUsersTab = memo(AdminUsersTabImpl);
export default AdminUsersTab;
