import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { supabase } from "../../integrations/supabase/client";
import { Play, Radio, Clock, ChevronRight } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

interface VideoRecommendationsProps {
  currentLessonId: string;
  courseId: number;
  chapterId?: string | null;
  onSelectLesson: (lessonId: string) => void;
}

interface RecommendedLesson {
  id: string;
  title: string;
  video_url: string;
  duration: number | null;
  lecture_type: string | null;
}

interface LiveSession {
  id: string;
  title: string;
  youtube_live_id: string;
  is_active: boolean | null;
  scheduled_at: string | null;
}

const VideoRecommendations = ({
  currentLessonId,
  courseId,
  chapterId,
  onSelectLesson,
}: VideoRecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<RecommendedLesson[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        // Fetch VIDEO lessons from same course (more results)
        const { data: lessonData } = await supabase
          .from("lessons")
          .select("id, title, video_url, duration, lecture_type")
          .eq("course_id", courseId)
          .neq("id", currentLessonId)
          .order("position", { ascending: true })
          .limit(20);

        if (lessonData) {
          // Include all lesson types (VIDEO, PDF, etc.) for broader recommendations
          setRecommendations(lessonData.slice(0, 12));
        }

        // Fetch ALL live sessions (not just this course) for broader recommendations
        const { data: liveData } = await supabase
          .from("live_sessions")
          .select("id, title, youtube_live_id, is_active, scheduled_at")
          .order("is_active", { ascending: false })
          .order("scheduled_at", { ascending: false })
          .limit(10);

        if (liveData) setLiveSessions(liveData);
      } catch (err) {
        reportError(err, { surface: "VideoRecommendations.fetch" });
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [currentLessonId, courseId, chapterId]);

  if (loading || (recommendations.length === 0 && liveSessions.length === 0)) return null;

  const extractThumb = (url: string) => {
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([^&\n?#]+)/
    );
    return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Live Sessions */}
      {liveSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Radio className="h-4 w-4 text-destructive" />
            Live Classes
          </h3>
          <div className="space-y-2">
            {liveSessions.map((session) => (
              <a
                key={session.id}
                href={`/live/${session.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors group"
              >
                <div className="w-20 h-12 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  <img
                    src={`https://img.youtube.com/vi/${session.youtube_live_id}/mqdefault.jpg`}
                    alt=""
                    width={80}
                    height={48}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <Radio className={cn("absolute h-5 w-5", session.is_active ? "text-destructive animate-pulse" : "text-white/80")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{session.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {session.is_active && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">LIVE</Badge>
                    )}
                    {session.scheduled_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(session.scheduled_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Related Videos */}
      {recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Play className="h-4 w-4 text-primary" />
            Related Videos
          </h3>
          <div className="space-y-2">
            {recommendations.map((lesson) => {
              const thumb = extractThumb(lesson.video_url);
              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition-colors group text-left"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      width={112}
                      height={64}
                      className="w-28 h-16 rounded-md object-cover flex-shrink-0 bg-muted"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-28 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Play className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {lesson.title}
                    </p>
                    {lesson.duration ? (
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {formatDuration(lesson.duration)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoRecommendations;
