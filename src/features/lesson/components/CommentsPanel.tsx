import { Loader2, MessageCircle, Send } from "lucide-react";
import type { Comment } from "@/hooks/useComments";
import { SmartImage } from "@/components/common/SmartImage";
import { formatRelativeTime } from "../lib/format";

interface CommentsPanelProps {
  comments: Comment[];
  loading: boolean;
  newComment: string;
  isPosting: boolean;
  postDisabled: boolean;
  onCommentChange: (value: string) => void;
  onPost: () => void;
  onOpenImage: (url: string) => void;
}

export function CommentsPanel({
  comments,
  loading,
  newComment,
  isPosting,
  postDisabled,
  onCommentChange,
  onPost,
  onOpenImage,
}: CommentsPanelProps) {
  return (
    <div className="px-4 py-4">
      <div className="space-y-6">
        <h3 className="font-semibold text-lg flex items-center gap-2 text-foreground">
          <MessageCircle className="h-5 w-5 text-primary" />
          Comments ({comments.length})
        </h3>

        {/* Comments List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p>No comments yet. Open <span className="font-semibold">Ask Doubt</span> to start the discussion.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 p-4 bg-muted/30 rounded-lg">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                  {comment.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground text-sm">
                      {comment.userName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-foreground text-sm whitespace-pre-wrap">
                    {comment.message}
                  </p>
                  {comment.imageUrl && (
                    <SmartImage
                      src={comment.imageUrl}
                      width={320}
                      height={240}
                      alt="Comment attachment"
                      className="mt-2 max-w-xs rounded-lg border cursor-pointer hover:opacity-90 transition-opacity object-contain"
                      onClick={() => onOpenImage(comment.imageUrl!)}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom comment input — quick add */}
      <div
        className="sticky bottom-0 -mx-4 mt-4 bg-background/95 border-t border-border px-4 py-3 flex items-center gap-2"
        style={{
          paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <input
          type="text"
          value={newComment}
          onChange={(e) => onCommentChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onPost();
            }
          }}
          aria-label="Write Comment"
          placeholder="Write Comment"
          className="flex-1 bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
        />
        <button
          onClick={onPost}
          disabled={postDisabled}
          aria-label="Send comment"
          className="text-primary disabled:text-muted-foreground/40 transition-colors p-3 -m-1.5"
        >
          {isPosting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
