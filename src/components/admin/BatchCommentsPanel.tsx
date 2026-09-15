/**
 * BatchCommentsPanel — lesson (video) comments with admin hide/unhide.
 * Pass a courseId to scope to one batch, or omit it for the latest comments
 * across the whole platform (used by the moderation page).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../ui/dialog";

interface CommentRow {
  id: string;
  lesson_id: string | null;
  user_name: string;
  message: string;
  created_at: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  lesson_title?: string | null;
}

interface Props {
  /** Scope to one batch. `null`/undefined = latest comments across all lessons. */
  courseId?: number | null;
}

export const BatchCommentsPanel = ({ courseId }: Props) => {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<CommentRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setRows([]);
    try {
      let lessonMap: Record<string, string> = {};
      let lessonIds: string[] | null = null;

      if (courseId != null) {
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, title")
          .eq("course_id", courseId)
          .limit(1000);
        lessonIds = (lessons ?? []).map((l) => l.id);
        lessonMap = Object.fromEntries((lessons ?? []).map((l) => [l.id, l.title]));
        if (lessonIds.length === 0) { setRows([]); return; }
      }

      let query = supabase
        .from("comments")
        .select("id, lesson_id, user_name, message, created_at, is_hidden, hidden_reason")
        .order("created_at", { ascending: false })
        .limit(200);
      if (lessonIds) query = query.in("lesson_id", lessonIds);

      const { data, error } = await query;
      if (error) throw error;

      let mapped = (data ?? []) as CommentRow[];
      if (courseId == null && mapped.length) {
        const ids = Array.from(new Set(mapped.map((c) => c.lesson_id).filter(Boolean))) as string[];
        const { data: lessons } = await supabase.from("lessons").select("id, title").in("id", ids);
        lessonMap = Object.fromEntries((lessons ?? []).map((l) => [l.id, l.title]));
      }
      mapped = mapped.map((c) => ({ ...c, lesson_title: c.lesson_id ? lessonMap[c.lesson_id] : null }));
      setRows(mapped);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? "Comments load nahi ho paaye");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const toggleHide = async (row: CommentRow, hidden: boolean, why: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_hide_content", {
      _content_type: "lesson_comment",
      _content_id: row.id,
      _hidden: hidden,
      _reason: hidden ? why.trim() : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(hidden ? "Comment hidden" : "Comment restored");
    setTarget(null);
    setReason("");
    fetchComments();
  };

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {rows.map((c) => (
              <div key={c.id} className="px-4 py-3 flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{c.user_name}</span>
                    {c.is_hidden && <Badge variant="destructive" className="text-[10px]">HIDDEN</Badge>}
                    <span className="text-[11px] text-muted-foreground">
                      {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  <p className="text-sm mt-1 break-words whitespace-pre-wrap">{c.message}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1 truncate">
                    {c.lesson_title ? `on: ${c.lesson_title}` : ""}
                    {c.is_hidden && c.hidden_reason ? ` · reason: ${c.hidden_reason}` : ""}
                  </p>
                </div>
                {c.is_hidden ? (
                  <Button
                    size="sm" variant="outline" className="gap-1 min-h-[44px] self-start"
                    disabled={busy}
                    onClick={() => toggleHide(c, false, "")}
                  >
                    <Eye className="h-4 w-4" /> Unhide
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="destructive" className="gap-1 min-h-[44px] self-start"
                    onClick={() => { setTarget(c); setReason(""); }}
                  >
                    <EyeOff className="h-4 w-4" /> Hide
                  </Button>
                )}
              </div>
            ))}
            {loading && (
              <div className="py-10 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && rows.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Koi comment nahi mila.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hide comment</DialogTitle>
            <DialogDescription>
              Ye comment students ko dikhna band ho jayega. Aap ise baad me unhide kar sakte hain.
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
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() => target && toggleHide(target, true, reason)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Hide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BatchCommentsPanel;
