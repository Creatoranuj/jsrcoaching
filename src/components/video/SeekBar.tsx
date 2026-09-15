import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChapterMarker, QuizMarker } from "@/hooks/useLessonMarkers";
import type { Bookmark } from "@/hooks/useLessonBookmarks";
import { formatShortTime } from "@/lib/timeFormat";

export interface SeekBarProps {
  currentTime: number;
  duration: number;
  /** 0..1 buffered ratio */
  buffered: number;
  chapters?: ChapterMarker[];
  quizMarkers?: QuizMarker[];
  bookmarks?: Bookmark[];
  /** Visual rotation applied to the OUTER container (0/90/180/270). */
  rotation?: 0 | 90 | 180 | 270;
  onSeek: (seconds: number) => void;
  onQuizMarkerClick?: (m: QuizMarker) => void;
  onBookmarkClick?: (b: Bookmark) => void;
  className?: string;
}

// Tooltip + a11y labels use the same human-friendly format as the bookmark
// list ("1h 29m") instead of raw MM:SS — see PRD §3.3.
const fmt = (s: number) => formatShortTime(s);

/**
 * Premium educational seek bar — touch-friendly, keyboard accessible,
 * with chapter / quiz / bookmark markers and hover tooltip.
 *
 * Self-contained: handles its own pointer + touch drag so the parent
 * doesn't re-render every move. Rotation-aware so coordinates map
 * correctly when the player is rendered inside a CSS-rotated container.
 */
const SeekBar = memo(({
  currentTime,
  duration,
  buffered,
  chapters = [],
  quizMarkers = [],
  bookmarks = [],
  rotation = 0,
  onSeek,
  onQuizMarkerClick,
  onBookmarkClick,
  className,
}: SeekBarProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [hover, setHover] = useState<{ ratio: number; x: number } | null>(null);

  const safeDur = duration > 0 ? duration : 0;
  const playedRatio = dragRatio ?? (safeDur > 0 ? currentTime / safeDur : 0);
  const playedPct = Math.max(0, Math.min(1, playedRatio)) * 100;
  const bufPct = Math.max(0, Math.min(1, buffered)) * 100;

  // Rotation-aware ratio from a screen-space pointer position.
  const ratioFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    // For 90/270 the visual horizontal of the bar maps to the rect's Y axis.
    let r: number;
    if (rotation === 90) {
      r = (clientY - rect.top) / rect.height;
    } else if (rotation === 270) {
      r = 1 - (clientY - rect.top) / rect.height;
    } else if (rotation === 180) {
      r = 1 - (clientX - rect.left) / rect.width;
    } else {
      r = (clientX - rect.left) / rect.width;
    }
    return Math.max(0, Math.min(1, r));
  }, [rotation]);

  // ── Pointer drag (mouse + pen + touch) ────────────────────────────────
  const beginDrag = useCallback((clientX: number, clientY: number) => {
    const r = ratioFromPoint(clientX, clientY);
    setDragRatio(r);
  }, [ratioFromPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (safeDur <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    beginDrag(e.clientX, e.clientY);
  }, [beginDrag, safeDur]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRatio !== null) {
      e.preventDefault();
      const r = ratioFromPoint(e.clientX, e.clientY);
      setDragRatio(r);
    } else if (e.pointerType === "mouse") {
      const r = ratioFromPoint(e.clientX, e.clientY);
      setHover({ ratio: r, x: e.clientX - (trackRef.current?.getBoundingClientRect().left ?? 0) });
    }
  }, [dragRatio, ratioFromPoint]);

  const finishDrag = useCallback(() => {
    if (dragRatio !== null && safeDur > 0) {
      onSeek(dragRatio * safeDur);
    }
    setDragRatio(null);
  }, [dragRatio, safeDur, onSeek]);

  const handlePointerUp = useCallback(() => finishDrag(), [finishDrag]);
  const handlePointerCancel = useCallback(() => setDragRatio(null), []);
  const handleMouseLeave = useCallback(() => setHover(null), []);

  // ── Keyboard a11y ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (safeDur <= 0) return;
    const step = e.shiftKey ? 10 : 5;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight": next = Math.min(safeDur, currentTime + step); break;
      case "ArrowLeft":  next = Math.max(0, currentTime - step); break;
      case "Home":       next = 0; break;
      case "End":        next = safeDur; break;
      case "PageUp":     next = Math.min(safeDur, currentTime + 30); break;
      case "PageDown":   next = Math.max(0, currentTime - 30); break;
    }
    if (next !== null) {
      e.preventDefault();
      onSeek(next);
    }
  }, [currentTime, safeDur, onSeek]);

  // ── Active chapter for tooltip text ──────────────────────────────────
  const activeChapterTitle = useMemo(() => {
    if (!chapters.length) return null;
    const t = hover ? hover.ratio * safeDur : currentTime;
    let title: string | null = null;
    for (const c of chapters) {
      if (c.start_seconds <= t) title = c.title;
      else break;
    }
    return title;
  }, [chapters, hover, currentTime, safeDur]);

  // Marker positions (memo on duration + arrays)
  const markerData = useMemo(() => {
    if (safeDur <= 0) return { ch: [], qz: [], bm: [] };
    return {
      ch: chapters.filter(c => c.start_seconds > 0 && c.start_seconds < safeDur),
      qz: quizMarkers.filter(q => q.at_seconds >= 0 && q.at_seconds <= safeDur),
      bm: bookmarks.filter(b => b.at_seconds >= 0 && b.at_seconds <= safeDur),
    };
  }, [chapters, quizMarkers, bookmarks, safeDur]);

  // Cleanup hover on unmount
  useEffect(() => () => setHover(null), []);

  const tooltipRatio = dragRatio ?? hover?.ratio ?? null;
  const tooltipTime = tooltipRatio !== null ? tooltipRatio * safeDur : null;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Video progress"
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.floor(safeDur))}
      aria-valuenow={Math.floor(Math.min(currentTime, safeDur))}
      aria-valuetext={`${fmt(currentTime)} of ${fmt(safeDur)}`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative h-10 md:h-8 cursor-pointer touch-none select-none flex items-center group/seek",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:rounded-full",
        className
      )}
    >
      {/* Visible track */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 group-hover/seek:h-2.5 md:group-hover/seek:h-3 rounded-full bg-white/15 transition-[height] duration-150 motion-reduce:transition-none overflow-visible">
        {/* Buffered */}
        <div
          className="absolute inset-y-0 left-0 bg-white/35 rounded-full pointer-events-none"
          style={{ width: `${bufPct}%`, willChange: "width" }}
        />
        {/* Played — smoothed between 250ms YT ticks; disabled during drag */}
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full pointer-events-none motion-reduce:!transition-none"
          style={{
            width: `${playedPct}%`,
            willChange: "width",
            transition: dragRatio === null ? "width 260ms linear" : "none",
          }}
        />

        {/* Chapter markers — thin vertical line */}
        {markerData.ch.map((c) => {
          const left = (c.start_seconds / safeDur) * 100;
          return (
            <div
              key={c.id}
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/70 pointer-events-none"
              style={{ left: `${left}%` }}
            />
          );
        })}

        {/* Quiz markers — accent dot, clickable */}
        {markerData.qz.map((q) => {
          const left = (q.at_seconds / safeDur) * 100;
          return (
            <button
              key={q.id}
              type="button"
              aria-label={q.label ? `Quiz: ${q.label}` : `Quiz at ${fmt(q.at_seconds)}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-black/40 hover:scale-125 transition-transform motion-reduce:transition-none"
              style={{ left: `${left}%` }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSeek(q.at_seconds); onQuizMarkerClick?.(q); }}
            />
          );
        })}

        {/* Bookmark markers — emerald dot */}
        {markerData.bm.map((b) => {
          const left = (b.at_seconds / safeDur) * 100;
          // Extract leading emoji as the bookmark "kind" (📌 default,
          // 📝 note, ❓ question, 💬 quote, ⭐ important). Falls back to 📌.
          const KINDS = ["📌", "📝", "❓", "💬", "⭐"];
          const first = (b.note ?? "").trim().match(/^\p{Extended_Pictographic}/u)?.[0];
          const emoji = first && KINDS.includes(first) ? first : "📌";
          return (
            <button
              key={b.id}
              type="button"
              aria-label={b.note ? `Bookmark: ${b.note}` : `Bookmark at ${fmt(b.at_seconds)}`}
              title={b.note ?? `Bookmark · ${fmt(b.at_seconds)}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto opacity-80 hover:opacity-100 hover:scale-105 transition-[opacity,transform] motion-reduce:transition-none"
              style={{ left: `${left}%` }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSeek(b.at_seconds); onBookmarkClick?.(b); }}
            >
              {/* Notion-style: tiny emoji floating just above a 1px tick */}
              <span
                aria-hidden
                className="text-[9px] leading-none mb-[1px] select-none"
                style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.6))" }}
              >
                {emoji}
              </span>
              <span
                aria-hidden
                className="block w-[2px] h-2.5 rounded-sm bg-emerald-500 shadow-[0_0_4px_rgba(34,197,94,0.55)]"
              />
            </button>
          );
        })}
      </div>

      {/* Thumb */}
      <div
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 bg-primary rounded-full shadow-lg pointer-events-none",
          "motion-reduce:!transition-none",
          dragRatio !== null && "scale-125"
        )}
        style={{
          left: `clamp(0px, calc(${playedPct}% - 7px), calc(100% - 14px))`,
          willChange: "left",
          transition: dragRatio === null
            ? "left 260ms linear, transform 100ms ease-out"
            : "transform 100ms ease-out",
        }}
      />

      {/* Tooltip */}
      {tooltipTime !== null && (
        <div
          className="absolute -top-9 left-0 px-2 py-1 rounded bg-black/90 text-white text-xs whitespace-nowrap pointer-events-none -translate-x-1/2"
          style={{ left: `${(tooltipRatio ?? 0) * 100}%` }}
        >
          {fmt(tooltipTime)}{activeChapterTitle ? ` · ${activeChapterTitle}` : ""}
        </div>
      )}
    </div>
  );
});

SeekBar.displayName = "SeekBar";

export default SeekBar;
