import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import type { Bookmark } from "@/hooks/useLessonBookmarks";
import { formatLongTime } from "@/lib/timeFormat";

interface Props {
  open: boolean;
  bookmark: Bookmark | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, note: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onJump?: (atSeconds: number) => void;
}

// Human-readable timestamp ("1 hour 29 minutes") so bookmarks read like
// notes instead of raw video offsets — see PRD §3.3.
const fmt = (s: number) => formatLongTime(s);

/**
 * Bookmark "kind" is encoded as a leading emoji on the note string so we
 * don't need a schema migration. SeekBar reads the same emoji to render
 * the matching pin above the tick mark.
 */
const KINDS = [
  { emoji: "📌", label: "Pin" },
  { emoji: "📝", label: "Note" },
  { emoji: "❓", label: "Doubt" },
  { emoji: "💬", label: "Quote" },
  { emoji: "⭐", label: "Important" },
] as const;

const KIND_EMOJIS = KINDS.map((k) => k.emoji);
const EMOJI_RE = /^(\p{Extended_Pictographic})\s?/u;

const splitKind = (raw: string): { emoji: string; text: string } => {
  const m = raw.match(EMOJI_RE);
  if (m && KIND_EMOJIS.includes(m[1] as (typeof KIND_EMOJIS)[number])) {
    return { emoji: m[1], text: raw.slice(m[0].length) };
  }
  return { emoji: "📌", text: raw };
};

/**
 * Notes editor tied to a single bookmark. Opens automatically on bookmark
 * create or when a user taps an existing bookmark marker on the seek bar.
 */
export default function BookmarkNoteDialog({ open, bookmark, onOpenChange, onSave, onDelete, onJump }: Props) {
  const [note, setNote] = useState("");
  const [emoji, setEmoji] = useState<string>("📌");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && bookmark) {
      const { emoji: e, text } = splitKind(bookmark.note ?? "");
      setEmoji(e);
      setNote(text);
    }
  }, [open, bookmark]);

  const handleSave = async () => {
    if (!bookmark) return;
    setSaving(true);
    const body = note.trim();
    const composed = body ? `${emoji} ${body}` : emoji;
    try { await onSave(bookmark.id, composed); } finally { setSaving(false); }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <BookmarkIcon className="h-4 w-4 text-foreground/70" />
            Bookmark · {bookmark ? fmt(bookmark.at_seconds) : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Kind picker — Lovable pill (invert on active, no border on active) */}
        <div className="flex flex-wrap gap-1.5 pb-1">
          {KINDS.map((k) => {
            const active = emoji === k.emoji;
            return (
              <button
                key={k.emoji}
                type="button"
                onClick={() => setEmoji(k.emoji)}
                aria-pressed={active}
                className={
                  "inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs transition-colors duration-150 whitespace-nowrap " +
                  (active
                    ? "bg-foreground text-background font-medium"
                    : "border border-border/60 bg-background text-foreground/70 hover:bg-muted/60 hover:text-foreground")
                }
              >
                <span className="text-sm leading-none">{k.emoji}</span>
                {k.label}
              </button>
            );
          })}
        </div>


        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write your doubt or note for this moment…"
          rows={5}
          autoFocus
          className="resize-none"
        />

        <div className="flex items-center justify-between gap-2 pt-2">
          {onDelete && bookmark && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={async () => { await onDelete(bookmark.id); onOpenChange(false); }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {onJump && bookmark && (
              <Button variant="outline" size="sm" onClick={() => { onJump(bookmark.at_seconds); onOpenChange(false); }}>
                Jump to
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}>Save note</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
