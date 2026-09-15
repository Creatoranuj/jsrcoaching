import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Smartphone, RefreshCw, LogOut } from "lucide-react";

// Active-device sessions tab, lifted verbatim out of Admin.tsx. Fetching and
// force-logout stay in the page; this component only renders what it is given.

export interface AdminSession {
  id: string;
  user_id: string;
  device_type: string | null;
  user_agent: string | null;
  logged_in_at: string;
  last_active_at: string;
}

interface AdminSessionsTabProps {
  sessions: AdminSession[];
  loading: boolean;
  terminatingSession: string | null;
  onRefresh: () => void;
  onForceLogout: (sessionId: string, userId: string) => void;
}

function AdminSessionsTabImpl({
  sessions,
  loading,
  terminatingSession,
  onRefresh,
  onForceLogout,
}: AdminSessionsTabProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" /> Active Sessions ({sessions.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor all active device sessions. Force-logout suspicious or excess sessions.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Monitor className="h-10 w-10" />
            <p className="font-medium">No active sessions</p>
            <p className="text-sm">Sessions are created when users log in</p>
          </div>
        ) : (
          <div className="divide-y">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
                <div
                  className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    s.device_type === "mobile" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {s.device_type === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs capitalize shrink-0">{s.device_type}</Badge>
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{s.user_id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {s.user_agent ? s.user_agent.substring(0, 70) + "..." : "Unknown browser"}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Logged in: {new Date(s.logged_in_at).toLocaleString()}</span>
                    <span>·</span>
                    <span>Last active: {new Date(s.last_active_at).toLocaleString()}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive border-destructive/20 hover:bg-destructive/10"
                  onClick={() => onForceLogout(s.id, s.user_id)}
                  disabled={terminatingSession === s.id}
                >
                  {terminatingSession === s.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <><LogOut className="h-3 w-3 mr-1" />Logout</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const AdminSessionsTab = memo(AdminSessionsTabImpl);
export default AdminSessionsTab;
