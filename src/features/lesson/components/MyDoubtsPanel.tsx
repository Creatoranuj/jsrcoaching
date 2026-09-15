import { Loader2, MessageSquare } from "lucide-react";
import type { Comment } from "@/hooks/useComments";
import { SmartImage } from "@/components/common/SmartImage";
import { formatRelativeTime } from "../lib/format";

interface MyDoubtsPanelProps {
  comments: Comment[];
  loading: boolean;
  userId?: string;
}

export function MyDoubtsPanel({ comments, loading, userId }: MyDoubtsPanelProps) {
  const mine = comments.filter((c) => userId && c.userId === userId);
  return (
    <div className="px-4 py-4">
      <h3 className="font-semibold text-base text-foreground mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        My Doubts
      </h3>
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : mine.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm">You haven't posted any doubts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mine.map((comment) => (
            <div key={comment.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                {comment.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-foreground text-sm">{comment.userName}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                </div>
                <p className="text-foreground text-sm whitespace-pre-wrap">{comment.message}</p>
                {comment.imageUrl && (
                  <SmartImage src={comment.imageUrl} width={320} height={240} alt="" className="mt-2 max-w-xs rounded-lg border object-contain" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
