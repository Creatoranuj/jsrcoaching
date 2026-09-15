/**
 * BatchRosterTable — students enrolled in one batch, with per-row
 * "remove from batch" (enrollment revoke only; the account stays active).
 */
import { memo, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { ChevronRight, Loader2, Search, UserMinus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../ui/dialog";

export interface RosterRow {
  enrollment_id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  purchased_at: string | null;
  status: string | null;
  progress_percentage: number | null;
  is_blocked: boolean | null;
}

interface Props {
  rows: RosterRow[];
  loading: boolean;
  onChanged: () => void;
}

const BatchRosterTableImpl = ({ rows, loading, onChanged }: Props) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<RosterRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.full_name, r.email, r.mobile].some((v) => v?.toLowerCase().includes(t)),
    );
  }, [rows, q]);

  const doRemove = async () => {
    if (!target) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_revoke_enrollment", {
      _enrollment_id: target.enrollment_id,
      _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Student removed from this batch");
    setTarget(null);
    setReason("");
    onChanged();
  };

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email or mobile"
          className="pl-9 text-base"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.enrollment_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.full_name || "Unnamed"}</span>
                    {r.is_blocked && <Badge variant="destructive" className="text-[10px]">BLOCKED</Badge>}
                    {r.status && r.status !== "active" && (
                      <Badge variant="secondary" className="text-[10px] uppercase">{r.status}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.email || "no email"}{r.mobile ? ` · ${r.mobile}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
                    Enrolled {r.purchased_at ? format(new Date(r.purchased_at), "dd MMM yyyy") : "—"}
                    {" · "}{r.progress_percentage ?? 0}% done
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1 min-h-[44px]"
                  onClick={() => { setTarget(r); setReason(""); }}
                >
                  <UserMinus className="h-4 w-4" /> Remove
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="min-h-[44px] min-w-[44px]"
                  aria-label={`Open ${r.full_name || "student"} details`}
                  onClick={() => navigate(`/admin/users/${r.user_id}`)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {loading && (
              <div className="py-10 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No students in this batch yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from batch</DialogTitle>
            <DialogDescription>
              {target?.full_name || target?.email} ka is batch ka access khatam ho jayega.
              Account block nahi hoga.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="text-base"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doRemove} disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const BatchRosterTable = memo(BatchRosterTableImpl);
export default BatchRosterTable;
