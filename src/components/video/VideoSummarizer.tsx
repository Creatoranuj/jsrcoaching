import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { Button } from "../ui/button";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Copy, CheckCircle2, Brain, Globe, Eye, EyeOff } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { Markdown } from "../Markdown";

type Mode = "summary" | "research" | "deep_search";

interface VideoSummarizerProps {
  videoUrl?: string;
  lessonTitle?: string;
  lessonId?: string;
  lessonDescription?: string;
  lessonOverview?: string;
}

interface Source {
  url: string;
  title: string;
}

const MODE_CONFIG = {
  summary: {
    icon: Sparkles,
    label: "Summary",
    loading: "Analyzing lecture content...",
    color: "text-primary",
    bgActive: "bg-primary/20 border-primary/40",
  },
  research: {
    icon: Brain,
    label: "Research",
    loading: "🧠 Deep research in progress... Thinking...",
    color: "text-purple-500",
    bgActive: "bg-purple-500/20 border-purple-500/40",
  },
  deep_search: {
    icon: Globe,
    label: "Deep Search",
    loading: "🌐 Searching the web for study material...",
    color: "text-emerald-500",
    bgActive: "bg-emerald-500/20 border-emerald-500/40",
  },
} as const;

const VideoSummarizer = ({ videoUrl, lessonTitle, lessonId, lessonDescription, lessonOverview }: VideoSummarizerProps) => {
  const [results, setResults] = useState<Record<string, { summary: string; thinking?: string; sources?: Source[]; hasContext?: boolean; contextWarning?: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>("summary");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  const currentResult = results[mode];

  // Load cached results
  useEffect(() => {
    if (!lessonId) return;
    const cached: Record<string, { summary: string; thinking?: string; sources?: Source[]; hasContext?: boolean; contextWarning?: string | null }> = {};
    (["summary", "research", "deep_search"] as Mode[]).forEach((m) => {
      try {
        const raw = localStorage.getItem(`nb_summary_${lessonId}_${m}`);
        if (raw) cached[m] = JSON.parse(raw);
      } catch {}
    });
    if (Object.keys(cached).length > 0) setResults(cached);
  }, [lessonId]);

  const generateSummary = async () => {
    if (!videoUrl && !lessonTitle) {
      toast.error("No video selected");
      return;
    }

    setLoading(true);
    try {
      let data: { summary?: string; thinking?: string; sources?: Source[]; error?: string; hasContext?: boolean; contextWarning?: string | null };

      if (mode === "deep_search") {
        const { data: d, error } = await supabase.functions.invoke("deep-search-lecture", {
          body: { query: lessonTitle || videoUrl, lessonId, thinking: thinkingEnabled, description: lessonDescription, overview: lessonOverview },
        });
        if (error) throw error;
        data = d;
      } else {
        // supabase.functions.invoke — works in native APK without the dev proxy.
        const { data: d, error } = await supabase.functions.invoke("summarize-video", {
          body: { videoUrl, lessonTitle, lessonId, mode, thinking: thinkingEnabled, description: lessonDescription, overview: lessonOverview },
        });
        if (error) throw new Error(error.message || "Summarize failed");
        data = d;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const result = {
        summary: data?.summary || "Could not generate result.",
        thinking: data?.thinking || undefined,
        sources: data?.sources || undefined,
        hasContext: data?.hasContext,
        contextWarning: data?.contextWarning || null,
      };

      setResults((prev) => ({ ...prev, [mode]: result }));
      if (lessonId) {
        try {
          localStorage.setItem(`nb_summary_${lessonId}_${mode}`, JSON.stringify(result));
        } catch {}
      }
    } catch (err: unknown) {
      reportError(err, { surface: "VideoSummarizer.generate" });
      toast.error("Failed to generate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copySummary = () => {
    if (!currentResult?.summary) return;
    navigator.clipboard.writeText(currentResult.summary);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/15 hover:to-accent/15 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">JSR COACHING Agent</p>
            <p className="text-[10px] text-muted-foreground">Researcher • Summary • Deep Search</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Mode Selector */}
          <div className="flex gap-2">
            {(Object.keys(MODE_CONFIG) as Mode[]).map((m) => {
              const cfg = MODE_CONFIG[m];
              const Icon = cfg.icon;
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                    isActive ? cfg.bgActive + " " + cfg.color : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Thinking Toggle */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">🧠 Show Thinking Process</span>
            <button
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                thinkingEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform ${
                  thinkingEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Context indicator */}
          {!lessonDescription && !lessonOverview && (
            <p className="text-[10px] text-amber-500/80 flex items-center gap-1 px-1">
              ⚠️ Limited context — results may vary
            </p>
          )}

          {/* Generate Button */}
          {!currentResult && !loading && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                {mode === "summary" && "Get AI-powered summary of this lecture"}
                {mode === "research" && "Deep research with conceptual analysis & PYQ"}
                {mode === "deep_search" && "Search the web for extra study material"}
              </p>
              <Button onClick={generateSummary} className="gap-2">
                {(() => { const Icon = MODE_CONFIG[mode].icon; return <Icon className="h-4 w-4" />; })()}
                {mode === "summary" ? "Generate Summary" : mode === "research" ? "Start Research" : "Deep Search"}
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{MODE_CONFIG[mode].loading}</p>
            </div>
          )}

          {/* Results */}
          {currentResult && !loading && (
            <>
              {/* Thinking Section */}
              {currentResult.thinking && (
                <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
                  <button
                    onClick={() => setThinkingExpanded(!thinkingExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {thinkingExpanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      🧠 AI Thinking Process
                    </span>
                    {thinkingExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {thinkingExpanded && (
                    <div className="px-3 pb-3 text-xs text-muted-foreground/80 italic font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {currentResult.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Main Summary */}
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                <Markdown gfm={false}>{currentResult.summary}</Markdown>
              </div>

              {currentResult.contextWarning && (
                <p className="text-xs text-muted-foreground">{currentResult.contextWarning}</p>
              )}

              {/* Sources (deep search) */}
              {currentResult.sources && currentResult.sources.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">🔗 Sources</p>
                  {currentResult.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-primary hover:underline truncate"
                    >
                      [{i + 1}] {s.title || s.url}
                    </a>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={copySummary}>
                  {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={generateSummary}>
                  {(() => { const Icon = MODE_CONFIG[mode].icon; return <Icon className="h-3 w-3" />; })()}
                  Regenerate
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoSummarizer;
