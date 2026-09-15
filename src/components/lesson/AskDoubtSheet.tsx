import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  MessageSquare,
  AlertTriangle,
  Send,
  X,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  Loader2,
  Download,
  Copy as CopyIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";

export type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  error?: boolean;
};

interface AskDoubtSheetProps {
  open: boolean;
  onClose: () => void;
  chatMessages: ChatMsg[];
  chatBusy: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: (overrideText?: string) => void;
  regenerateLast: () => void;
  askingName: string;
  /** Returns current player time in seconds, or 0 if unavailable. */
  getVideoTime: () => number;
  suggestions: string[];
  /** Optional lesson title shown as subtitle in the header. */
  lessonTitle?: string;
  /** When true, render inline (below the video player) instead of fullscreen sheet. */
  inline?: boolean;
  /** Persist a single AI answer to local Downloads as a .md file. */
  saveAnswer?: (markdown: string, index: number) => void | Promise<void>;
  /** Stable key (usually lesson id) used to persist per-thread likes/feedback. */
  persistKey?: string;
}

const QUICK_PROMPTS = [
  "What is the teacher explaining here?",
  "Which formula to use for this?",
  "Help me understand this slide.",
  "Explain in Hindi",
  "1 example do",
  "MCQ practice karao",
];

const formatStamp = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

const relativeShort = (ts: number) => {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

type LocalState = {
  likes: Record<number, number>;
  liked: Record<number, boolean>;
  feedback: Record<number, "up" | "down" | undefined>;
};

export const AskDoubtSheet = ({
  open,
  onClose,
  chatMessages,
  chatBusy,
  chatInput,
  setChatInput,
  sendChat,
  regenerateLast,
  askingName,
  getVideoTime,
  suggestions,
  lessonTitle,
  inline = false,
  saveAnswer,
  persistKey,
}: AskDoubtSheetProps) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const storageKey = persistKey ? `nb_askdoubt_local:${persistKey}` : null;
  const [local, setLocal] = useState<LocalState>(() => {
    if (!storageKey || typeof window === "undefined") return { likes: {}, liked: {}, feedback: {} };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return { likes: {}, liked: {}, feedback: {}, ...JSON.parse(raw) };
    } catch {}
    return { likes: {}, liked: {}, feedback: {} };
  });
  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(local)); } catch {}
  }, [local, storageKey]);
  // Per-thread collapse state for the AI reply. Defaults to expanded.
  // Replies are collapsed by default — user explicitly expands via the "Reply" pill.
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const feedRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Push a sentinel state when sheet opens so hardware back closes it instead
  // of navigating away. Pop the state on graceful close so we don't leave junk.
  useEffect(() => {
    if (!open || inline) return;
    const sentinel = { askDoubtSheet: true };
    window.history.pushState(sentinel, "");
    const onPop = () => onCloseRef.current?.();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.askDoubtSheet) {
        window.history.back();
      }
    };
  }, [open, inline]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatBusy, open]);

  // Auto-focus textarea when composer opens
  useEffect(() => {
    if (composerOpen) {
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [composerOpen]);

  // Pair user + following assistant messages into "doubt threads"
  const threads = useMemo(() => {
    const out: Array<{
      idx: number;
      user: ChatMsg;
      assistant?: ChatMsg;
      assistantBusy?: boolean;
    }> = [];
    for (let i = 0; i < chatMessages.length; i++) {
      const m = chatMessages[i];
      if (m.role !== "user") continue;
      const next = chatMessages[i + 1];
      const assistant = next?.role === "assistant" ? next : undefined;
      out.push({ idx: i, user: m, assistant });
    }
    if (chatBusy && out.length > 0 && !out[out.length - 1].assistant) {
      out[out.length - 1].assistantBusy = true;
    }
    return out;
  }, [chatMessages, chatBusy]);

  // Extract leading "mm:ss" stamp from question text if user prefixed one
  const parseStamp = (text: string): { stamp: string | null; rest: string } => {
    const m = text.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(.*)$/s);
    if (m) return { stamp: m[1], rest: m[2] };
    return { stamp: null, rest: text };
  };

  const handleSubmit = () => {
    const raw = chatInput.trim();
    if (!raw) return;
    void tapHaptic("light");
    // Auto-prefix current video timestamp if the user did not include one.
    const withStamp = /^\d{1,2}:\d{2}\s*[-–—]/.test(raw)
      ? raw
      : `${formatStamp(getVideoTime())} - ${raw}`;
    setChatInput("");
    sendChat(withStamp);
    setComposerOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        inline
          ? "relative w-full bg-background flex flex-col"
          : "fixed inset-0 z-[80] bg-background flex flex-col animate-in slide-in-from-bottom duration-200"
      )}
      style={inline && threads.length > 0 ? { minHeight: "calc(100dvh - 320px)" } : undefined}
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-label="Academic doubts"
    >
      {/* Sticky header — only in fullscreen sheet variant */}
      {!inline && (
      <header
        className="bg-card/95 backdrop-blur-md border-b border-border shadow-sm"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
      >
        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            onClick={onClose}
            aria-label="Close doubts"
            className="h-11 w-11 -ml-2 rounded-full inline-flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">
              Academic Doubts
            </h2>
            {lessonTitle && (
              <p className="text-[11px] text-muted-foreground truncate">
                {lessonTitle}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-1">
            <MessageSquare className="h-3 w-3" />
            {askingName}
          </span>
        </div>
      </header>
      )}

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {threads.length === 0 && !chatBusy && (
          <div className="flex flex-col items-center text-center px-4 pt-3 pb-2">
            <div className="relative mb-2">
              <div className="relative h-11 w-11 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-foreground/70" />
              </div>
            </div>
            <p className="text-sm font-bold text-foreground">
              Apna pehla doubt poochho
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs leading-snug">
              Video me jis point pe doubt aaye, tap karke poochho.
            </p>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 min-h-10 rounded-full bg-foreground text-background font-semibold text-xs hover:bg-foreground/90 active:scale-[0.98] transition-all"
            >
              <Send className="h-3.5 w-3.5" />
              Post your first doubt
            </button>
            <div className="mt-3 w-full max-w-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2 font-semibold">
                Quick suggestions
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      void selectionHaptic();
                      setChatInput(s);
                      setComposerOpen(true);
                    }}
                    className="text-[11px] px-3 py-1 rounded-full border border-border/60 bg-background hover:bg-muted/60 text-foreground/80 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {threads.map(({ idx, user, assistant, assistantBusy }) => {
          const { stamp, rest } = parseStamp(user.content);
          const likes = local.likes[idx] || 0;
          const liked = !!local.liked[idx];
          const fb = local.feedback[idx];
          const replyCount = assistant ? 1 : 0;
          return (
            <div key={idx} className="space-y-2 px-1 py-4 border-b border-border/60 last:border-b-0">
              {/* User doubt — flat, no box */}
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-foreground">You</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{relativeShort(user.ts)}</span>
                </div>
                <p className="mt-2 text-[15px] leading-[1.55] text-foreground break-words">
                  {stamp && (
                    <span className="font-bold text-primary mr-1">{stamp} -</span>
                  )}
                  <span className="text-foreground/80">{rest}</span>
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLocal((p) => ({
                        ...p,
                        liked: { ...p.liked, [idx]: !liked },
                        likes: { ...p.likes, [idx]: Math.max(0, likes + (liked ? -1 : 1)) },
                      }))
                    }
                    className={cn(
                      "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      "after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']", // 44px hit-slop, no visual change
                      liked
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                    )}
                  >
                    <ArrowUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
                    Like
                    <span className="text-muted-foreground">·</span>
                    <span>{likes}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => assistant && setExpandedReplies((p) => ({ ...p, [idx]: !p[idx] }))}
                    disabled={!assistant}
                    aria-expanded={!!expandedReplies[idx]}
                    className={cn(
                      "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      "after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
                      assistant
                        ? "text-foreground hover:bg-accent/30 cursor-pointer"
                        : "text-muted-foreground/60"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {replyCount} {replyCount === 1 ? "Reply" : "Replies"}
                    {assistant && (expandedReplies[idx]
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />)}
                  </button>

                  <button
                    type="button"
                    onClick={() => toast("Reported — thanks for flagging.")}
                    aria-label="Report"
                    className="relative text-muted-foreground hover:text-destructive p-1.5 rounded-full hover:bg-destructive/5 after:absolute after:-inset-2 after:content-['']"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* AI reply — flat, indented with left accent only */}
              {(assistantBusy || (assistant && expandedReplies[idx])) && (
                <div className="mt-2 pl-3 ml-3 border-l-2 border-primary/40 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 font-semibold text-primary">
                      <MessageSquare className="h-3 w-3" />
                      {askingName}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {assistant ? relativeShort(assistant.ts) : "Just now"}
                    </span>
                    {assistant && !assistantBusy && (
                      <button
                        type="button"
                        onClick={() => setExpandedReplies((p) => ({ ...p, [idx]: false }))}
                        aria-label="Hide reply"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/30"
                      >
                        Hide <ChevronUp className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {assistantBusy ? (
                    <p className="mt-2 text-sm italic text-muted-foreground flex items-center gap-1">
                      {askingName} is typing
                      <span className="inline-flex gap-0.5 ml-1">
                        <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" />
                      </span>
                    </p>
                  ) : assistant?.error ? (
                    <div className="mt-2 space-y-2">
                      <article className="markdown-body flexoki text-sm text-destructive" style={{ background: "transparent" }}>
                        <Markdown>{assistant.content}</Markdown>
                      </article>
                      <button
                        type="button"
                        onClick={regenerateLast}
                        className="min-h-11 inline-flex items-center px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                      >
                        Retry
                      </button>
                    </div>
                  ) : assistant ? (
                    <>
                      <div className="mt-2 overflow-x-auto">
                        <article className="markdown-body flexoki text-sm leading-relaxed text-foreground/85 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_pre]:overflow-x-auto" style={{ background: "transparent" }}>
                          <Markdown>{assistant.content}</Markdown>
                        </article>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLocal((p) => ({
                              ...p,
                              feedback: { ...p.feedback, [idx]: fb === "up" ? undefined : "up" },
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border",
                            fb === "up"
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          )}
                        >
                          <ThumbsUp className={cn("h-3.5 w-3.5", fb === "up" && "fill-current")} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLocal((p) => ({
                              ...p,
                              feedback: { ...p.feedback, [idx]: fb === "down" ? undefined : "down" },
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border",
                            fb === "down"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          )}
                        >
                          <ThumbsDown className={cn("h-3.5 w-3.5", fb === "down" && "fill-current")} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (navigator.clipboard?.writeText) {
                                await navigator.clipboard.writeText(assistant.content);
                              }
                              toast.success("Copied");
                            } catch { toast.error("Copy failed"); }
                          }}
                          aria-label="Copy answer"
                          title="Copy"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        >
                          <CopyIcon className="h-3.5 w-3.5" />
                        </button>
                        {saveAnswer && (
                          <button
                            type="button"
                            onClick={() => saveAnswer(assistant.content, idx)}
                            aria-label="Save to Downloads"
                            title="Save to Downloads"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Save
                          </button>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick prompts strip */}
      {!composerOpen && threads.length > 0 && (
        <div className="bg-background border-t border-border/60 px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                void selectionHaptic();
                setChatInput(q);
                setComposerOpen(true);
              }}
              className="shrink-0 whitespace-nowrap text-xs px-3.5 h-8 inline-flex items-center rounded-full border border-border/60 bg-background hover:bg-muted/60 text-foreground/80 hover:text-foreground transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Bottom CTA / Composer */}
      <div
        className="bg-background border-t border-border/60"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      >
        {composerOpen ? (
          <div className="px-3 pt-3 pb-2">
            <div className="rounded-3xl border border-border/60 bg-card px-3 pt-2 pb-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Mention{" "}
                  <span className="font-bold text-primary">@{askingName}</span>{" "}
                  to ask your doubts
                </p>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  aria-label="Close composer"
                  className="h-11 w-11 -mt-2 -mr-2 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <textarea
                ref={taRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  // Ignore Enter while IME is composing (Hindi/Devanagari, CJK)
                  if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as { isComposing?: boolean }).isComposing) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={`@${askingName} ${formatStamp(getVideoTime())} - apna doubt likhiye…`}
                rows={2}
                disabled={chatBusy}
                inputMode="text"
                className="mt-2 w-full resize-none bg-transparent text-base outline-none placeholder:text-foreground/40 max-h-40 py-1 leading-relaxed"
              />
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  disabled
                  title="Attach (coming soon)"
                  aria-label="Attach"
                  className="h-11 w-11 rounded-lg flex items-center justify-center text-foreground/40"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={chatBusy || !chatInput.trim()}
                  aria-label="Send doubt"
                  className="h-11 w-11 rounded-full inline-flex items-center justify-center bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground transition-all duration-150 active:scale-[0.94]"
                >
                  {chatBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => { void selectionHaptic(); setComposerOpen(true); }}
              disabled={chatBusy}
              className="w-full h-12 rounded-full font-semibold text-sm text-background bg-foreground hover:bg-foreground/90 active:scale-[0.98] transition-transform duration-150 ease-out disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              Post a doubt
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AskDoubtSheet;