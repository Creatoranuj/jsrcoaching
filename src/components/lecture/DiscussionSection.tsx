import React, { useState, useEffect } from 'react';
import { reportError } from "@/lib/sentry";
import { Avatar, AvatarFallback } from '../ui/avatar';
import { MessageSquare, Send, Heart, AlertTriangle } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useToast } from '../../hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
  id: string;
  message: string;
  user_name: string;
  created_at: string;
  lesson_id: string;
}

interface DiscussionSectionProps {
  lessonId: string;
  userId?: string;
  userName?: string;
}

/**
 * Discussion/Comments Section
 * Connected to Supabase comments table
 */
const DiscussionSection: React.FC<DiscussionSectionProps> = ({
  lessonId,
  userId,
  userName = 'Anonymous',
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false });

      if (error) {
        reportError(error, { surface: "DiscussionSection.comments" });
        toast({
          title: 'Error',
          description: 'Failed to load comments',
          variant: 'destructive',
        });
      } else {
        setComments(data || []);
      }
      
      setIsLoading(false);
    };

    if (lessonId) {
      fetchComments();
    }

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`comments-${lessonId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `lesson_id=eq.${lessonId}`,
        },
        (payload) => {
          setComments((prev) => [payload.new as Comment, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lessonId, toast]);

  const submitComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);

    const { error } = await supabase
      .from('comments')
      .insert({
        lesson_id: lessonId,
        message: newComment.trim(),
        user_name: userName,
        user_id: userId,
      } as any);

    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to post comment',
        variant: 'destructive',
      });
    } else {
      setNewComment('');
      toast({
        title: 'Comment posted!',
        description: 'Your comment has been added to the discussion',
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col">
      {/* Comments List */}
      <div className="flex-1">
        {isLoading ? (
          <div role="status" aria-busy="true" aria-live="polite" aria-label="Loading comments" className="space-y-3 py-2">
            <span className="sr-only">Loading comments</span>
            {[0,1,2].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-card">
                <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-shimmer h-3 w-1/3 rounded" />
                  <div className="skeleton-shimmer h-3 w-5/6 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No comments yet</p>
            <p className="text-sm text-muted-foreground/70">
              Be the first to start a discussion!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {comments.map((comment) => (
              <div key={comment.id} className="py-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {getInitials(comment.user_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-sm text-foreground">
                    {comment.user_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    • {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words mb-2">
                  {comment.message}
                </p>
                <div className="flex items-center gap-5">
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors">
                    <Heart className="w-4 h-4" />
                    Like
                  </button>
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <AlertTriangle className="w-4 h-4" />
                    Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Comment input — pinned at bottom */}
      <div className="sticky bottom-0 bg-background border-t border-border flex items-center gap-2 pt-3 mt-2"
          style={{
            paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 0.5rem), calc(var(--nb-keyboard-h, 0px) + 0.5rem))",
            paddingLeft: "max(0px, env(safe-area-inset-left))",
            paddingRight: "max(0px, env(safe-area-inset-right))",
          }}>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitComment();
            }
          }}
          placeholder="Write Comment"
          className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none py-2 rounded-xl"
        />
        <button
          onClick={submitComment}
          disabled={!newComment.trim() || isSubmitting}
          aria-label="Send comment"
          className="text-primary disabled:text-muted-foreground/40 transition-colors p-2"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default DiscussionSection;
