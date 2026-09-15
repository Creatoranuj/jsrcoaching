import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { Bell } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";

interface Notice {
  id: string;
  title: string;
  content: string;
  created_at: string;
  isRead?: boolean;
}

const NotificationDropdown = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotices();
  }, [user?.id]);

  const fetchNotices = useCallback(async () => {
    const { data: noticeData } = await supabase
      .from("notices")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!noticeData) return;

    let readIds = new Set<string>();
    if (user) {
      const { data: reads } = await supabase
        .from("notification_reads")
        .select("notice_id")
        .eq("user_id", user.id)
        .in("notice_id", noticeData.map((n) => n.id));
      readIds = new Set((reads || []).map((r) => r.notice_id));
    }
    const mapped = noticeData.map((n) => ({ ...n, isRead: readIds.has(n.id) }));
    setNotices(mapped);
    setUnreadCount(mapped.filter((n) => !n.isRead).length);
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user || notices.length === 0) return;
    const unread = notices.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    await supabase.from("notification_reads").upsert(
      unread.map((n) => ({ user_id: user.id, notice_id: n.id })),
      { onConflict: "user_id,notice_id" }
    );
    setNotices((cur) => cur.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [user, notices]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void markAllRead();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} className="text-foreground hover:bg-muted relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive border-2 border-card" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 bg-popover z-50">
        <div className="p-3 border-b border-border">
          <h4 className="font-semibold text-sm text-foreground">Notifications</h4>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No new notifications</p>
          ) : (
            notices.map((n) => (
              <button
                key={n.id}
                className={`w-full text-left p-3 hover:bg-muted transition-colors border-b border-border last:border-0 ${n.isRead ? "opacity-70" : ""}`}
                onClick={() => { setOpen(false); navigate("/notices"); }}
              >
                <p className={`text-sm line-clamp-1 ${n.isRead ? "font-normal text-muted-foreground" : "font-semibold text-foreground"}`}>{n.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.content}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </button>
            ))
          )}
        </div>
        <button
          className="w-full p-2 text-xs text-center text-primary hover:bg-muted transition-colors border-t border-border font-medium"
          onClick={() => { setOpen(false); navigate("/notices"); }}
        >
          View all notices
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationDropdown;
