import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Bookmark as BookmarkIcon, ChevronDown, ChevronRight, Pencil, Play, Trash2 } from "lucide-react";
import { useLessonBookmarks, type Bookmark } from "@/hooks/useLessonBookmarks";
import { formatShortTime } from "@/lib/timeFormat";
import BookmarkNoteDialog from "./BookmarkNoteDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

interface Props {
  lessonId: string;
}

/** Custom event the in-page player listens for to seek to a bookmark. */
export const BOOKMARK_SEEK_EVENT = "nb:lesson-seek" as const;

const KIND_EMOJIS = ["📌", "📝", "❓", "💬", "⭐"] as const;
const EMOJI_RE = /^(\p{Extended_Pictographic})\s?/u;

const splitKind = (raw: string | null): { emoji: string; text: string } => {
  const s = (raw ?? "").trim();
  const m = s.match(EMOJI_RE);
  if (m && (KIND_EMOJIS as readonly string[]).includes(m[1])) {
    return { emoji: m[1], text: s.slice(m[0].length) };
  }
  return { emoji: "📌", text: s };
};

/**
 * In-lesson bookmark list. Replaces the old "My Notes" panel — notes are now
 * a bookmark kind (`📝`) so users have one unified timeline of moments per
 * lecture. Items are sortable by timestamp; "Jump to" dispatches a window
 * event the active video player listens for.
 */
export default function BookmarksPanel({ lessonId }: Props) {
  const { bookmarks, update, remove } = useLessonBookmarks(lessonId);
  const [asc, setAsc] = useState(true);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sorted = useMemo(() => {
    const arr = bookmarks.slice();
    arr.sort((a, b) => (asc ? a.at_seconds - b.at_seconds : b.at_seconds - a.at_seconds));
    return arr;
  }, [bookmarks, asc]);

  const jump = (s: number) => {
    window.dispatchEvent(new CustomEvent(BOOKMARK_SEEK_EVENT, { detail: s }));
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
          <BookmarkIcon className="h-4 w-4 text-emerald-500" />
          Bookmarks <span className="text-muted-foreground font-normal">({bookmarks.length})</span>
        </h3>
        <button
          type="button"
          onClick={() => setAsc((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent/40"
          aria-label={asc ? "Sort descending" : "Sort ascending"}
        >
          {asc ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
          {asc ? "Oldest first" : "Newest first"}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <BookmarkIcon className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No bookmarks yet</p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Tap the bookmark button while watching to save a moment.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((b, i) => {
            const { emoji, text } = splitKind(b.note);
            const isOpen = !!expanded[b.id];
            const firstLine = (text || "").split(/\n/)[0]?.trim() || "";
            const hasMore = (text || "").length > firstLine.length;
            return (
              <li
                key={b.id}
                className={cn(
                  "group rounded-xl border border-border bg-card/60",
                  "hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-colors"
                )}
              >
                {/* Collapsed row — table-of-contents look */}
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [b.id]: !p[b.id] }))}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span className="text-base leading-none select-none shrink-0" aria-hidden>{emoji}</span>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">#{i + 1}</span>
                  <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatShortTime(b.at_seconds)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                    {firstLine || <span className="text-muted-foreground italic">No note</span>}
                  </span>
                </button>

                {/* Expanded body — full markdown + actions */}
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/60">
                    {text ? (
                      <article className="markdown-body flexoki text-sm text-foreground/90 [&_p]:my-1" style={{ background: "transparent" }}>
                        <Markdown>{text}</Markdown>
                      </article>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No note text.</p>
                    )}
                    <div className="mt-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => jump(b.at_seconds)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs hover:bg-accent border border-border"
                      >
                        <Play className="h-3.5 w-3.5" /> Jump
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(b)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs hover:bg-accent border border-border"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await remove(b.id); toast.success("Bookmark removed"); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs hover:bg-destructive/10 text-destructive border border-border"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <BookmarkNoteDialog
        open={!!editing}
        bookmark={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSave={async (id, note) => { await update(id, note || null); toast.success("Note saved"); }}
        onDelete={async (id) => { await remove(id); toast.success("Bookmark removed"); }}
        onJump={(s) => jump(s)}
      />
    </div>
  );
}