/**
 * TopicsCovered — Timestamped topics timeline with AI generation.
 * Extracted from LessonView.tsx (MAINT split).
 */
import { useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { ListVideo, Clock, Loader2, Edit2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export interface TopicsCoveredProps {
  lessonId: string;
  overview: string | null;
  isAdmin: boolean;
  onSaved?: (newOverview: string) => void;
  videoUrl?: string;
}

export function TopicsCovered({ lessonId, overview, isAdmin, onSaved, videoUrl }: TopicsCoveredProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(overview || "");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setEditText(overview || "");
  }, [overview]);

  const topics = (overview || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => {
      const [ts, ...rest] = line.split("|");
      return { ts: ts.trim(), topic: rest.join("|").trim() };
    });

  const handleSave = async () => {
    if (!lessonId) return;
    setSaving(true);
    try {
      await supabase.from("lessons").update({ overview: editText }).eq("id", lessonId);
      toast.success("Topics saved");
      setEditing(false);
      onSaved?.(editText);
    } catch {
      toast.error("Save nahi hua — dobara try karo");
    } finally {
      setSaving(false);
    }
  };

  const generateAiTimestamps = async () => {
    if (!videoUrl) {
      toast.error("Video URL nahi mila");
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-video", {
        body: { videoUrl, lessonTitle: "Generate timestamps", mode: "timestamps" },
      });
      if (error) throw new Error(error.message || "Summarize failed");
      const result = data?.summary || data?.timestamps || "";
      if (result) {
        const lines = result.split("\n").filter((l: string) => l.trim());
        const formatted = lines
          .map((line: string) => {
            const match = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]?\s*(.+)/);
            if (match) return `${match[1]}|${match[2].trim()}`;
            return line;
          })
          .join("\n");

        setEditText(formatted);
        setEditing(true);
        setCollapsed(false);
        toast.success("Timestamps ready — review and save");
      } else {
        toast.error("Is video ke liye timestamps nahi bane");
      }
    } catch (err: unknown) {
      logger.error("AI timestamp error:", err);
      toast.error("Timestamps nahi bane — thodi der baad dobara try karo");
    } finally {
      setAiLoading(false);
    }
  };

  const parseTimestamp = (ts: string): number | null => {
    const parts = ts.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListVideo className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Topics & Timestamps</span>
          {topics.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {topics.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !editing && (
            <>
              {videoUrl && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    generateAiTimestamps();
                  }}
                  className="p-1 rounded-md hover:bg-primary/10 transition-colors"
                  title="AI Generate Timestamps"
                >
                  {aiLoading ? (
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                  setCollapsed(false);
                }}
                className="p-1 rounded-md hover:bg-border transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 py-3">
          {editing ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Enter one topic per line as:{" "}
                <code className="bg-muted px-1 rounded">timestamp|topic</code>
              </p>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-40 text-base md:text-xs font-mono border border-border rounded-lg p-2 bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={
                  "0:00:18|Beginning the chapter\n0:02:06|Introduction\n0:07:48|System of Classification"
                }
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          ) : topics.length > 0 ? (
            <div className="space-y-0">
              {topics.map((t, i) => {
                const seconds = parseTimestamp(t.ts);
                return (
                  <div
                    key={`${t.ts}-${i}`}
                    className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <button
                      onClick={() => {
                        if (seconds !== null) {
                          const iframe = document.querySelector(
                            'iframe[src*="youtube"]'
                          ) as HTMLIFrameElement;
                          if (iframe?.contentWindow) {
                            iframe.contentWindow.postMessage(
                              JSON.stringify({
                                event: "command",
                                func: "seekTo",
                                args: [seconds, true],
                              }),
                              "*"
                            );
                            toast.success(`Jumped to ${t.ts}`);
                          }
                        }
                      }}
                      className="text-[11px] font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 hover:bg-primary/20 transition-colors cursor-pointer"
                    >
                      ▶ {t.ts}
                    </button>
                    <span className="text-sm text-foreground leading-snug">{t.topic}</span>
                  </div>
                );
              })}
            </div>
          ) : isAdmin ? (
            <p className="text-sm text-muted-foreground py-2">
              Click ✏️ to add topics or ✨ to auto-generate timestamps with AI.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default TopicsCovered;
