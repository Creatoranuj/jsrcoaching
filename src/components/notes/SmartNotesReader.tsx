import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Copy, Download, Loader2, Pencil, Save, X } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import ObsidianMarkdown from "./ObsidianMarkdown";
import { useLessonFeatureFlag } from "@/hooks/useLessonFeatureFlags";
import AutoScrollFab from "../viewer/AutoScrollFab";
import RotatePhoneIcon from "../icons/RotatePhoneIcon";
import { lockOrientation, unlockOrientation } from "../../lib/screenOrientation";
import { useSmartNote } from "../../hooks/useSmartNote";
import { beginSyntheticPop, isSyntheticPop } from "../../lib/reader/overlayHistory";

/** Reading-mode toggle: tap = sepia theme, long-press (≥450ms) = focus mode. */
function ReadingToggleButton({
  mode,
  onTap,
  onLongPress,
}: {
  mode: "off" | "theme" | "focus";
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const start = () => {
    longFired.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, 450);
  };
  const end = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (!longFired.current) onTap();
  };
  const cancel = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
  };
  return (
    <Button
      variant={mode !== "off" ? "secondary" : "ghost"}
      size="icon"
      onPointerDown={(e) => { e.stopPropagation(); start(); }}
      onPointerUp={end}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      aria-label="Reading mode (tap: theme, long-press: focus)"
      title="Tap: sepia theme · Long-press: distraction-free"
    >
      <BookOpen className="h-5 w-5" />
    </Button>
  );
}

/** Inline title with pencil-to-edit; commit on Enter / blur, cancel on Esc. */
function EditableTitle({ value, canEdit, onSave }: { value: string; canEdit: boolean; onSave: (next: string) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) return;
    await onSave(next);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="min-w-0 flex-1 truncate rounded-md border border-primary/40 bg-background px-2 py-1 text-sm font-semibold outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (canEdit) setEditing(true); }}
      className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-primary"
      title={canEdit ? "Tap to rename" : value}
      disabled={!canEdit}
    >
      {value}
    </button>
  );
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Copy failed");
  }
}

interface Props {
  /** Initial / fallback markdown content (e.g. lesson.transcript_md). */
  markdown: string;
  title: string;
  onBack: () => void;
  /** Optional save handler — wire to addDownload, downloadFile, etc. */
  onDownload?: () => void | Promise<void>;
  /** Wikilink click handler for `[[Name]]` references. */
  onOpenLink?: (name: string) => void;
  /** When provided, reader will load/save the user's personal Smart Note
   *  for this lesson (or course) from the `smart_notes` table. */
  lessonId?: string | null;
  courseId?: number | null;
  /** When set, opens THIS specific smart_notes row (multi-note mode). */
  noteId?: string | null;
  /** Pre-arm reading mode when opening the reader (e.g. from a "Reading" shortcut). */
  defaultReadingMode?: "off" | "theme" | "focus";
}

/**
 * Fullscreen Smart Notes reader. Mirrors the PDF attachment fullscreen UX.
 *
 * When `lessonId`/`courseId`/`noteId` is supplied, the reader becomes
 * editable and includes an inline title rename control.
 */
export default function SmartNotesReader({ markdown, title, onBack, onDownload, onOpenLink, lessonId, courseId, noteId, defaultReadingMode }: Props) {
  const isEditable = !!(lessonId || courseId || noteId);
  const notesAutoScrollEnabled = useLessonFeatureFlag("notesAutoScroll");
  const { note, loading: noteLoading, saving: noteSaving, save: saveNote, scheduleAutoSave } = useSmartNote({
    lessonId, courseId, noteId, defaultTitle: title,
  });

  // Resolved markdown shown to the reader: prefer non-empty saved note,
  // otherwise fall back to the prop. NOTE: use `||` not `??` — an empty
  // string `""` in `content_md` was previously preferred over the fallback,
  // causing the "Open" button to show a blank reader when an empty
  // smart_note row existed alongside a populated `transcript_md`.
  const savedMd = (note?.content_md ?? "").trim();
  const resolvedMarkdown = savedMd ? note!.content_md : markdown;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(resolvedMarkdown);
  // Keep draft in sync when the note finishes loading or the source markdown changes.
  useEffect(() => { if (!editing) setDraft(resolvedMarkdown); }, [resolvedMarkdown, editing]);
  const [chromeVisible, setChromeVisible] = useState(true);
  /** Two-tier reading mode:
   *   - `theme`  : sepia tint + reader typography, chrome still tappable.
   *   - `focus`  : distraction-free — chrome hidden, FABs hidden, sepia on.
   *   - `off`    : default.
   *  Tap on the BookOpen button cycles tip→theme→off; long-press jumps to
   *  `focus`. A short banner pill exits `focus` back to `off`.
   */
  const [readingMode, setReadingMode] = useState<"off" | "theme" | "focus">(defaultReadingMode ?? "off");
  const isReaderTheme = readingMode !== "off";
  const isFocus = readingMode === "focus";
  const [landscape, setLandscape] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<number | null>(null);

  const scheduleHide = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (isFocus) return;
    idleTimer.current = window.setTimeout(() => setChromeVisible(false), 2500);
  };

  useEffect(() => {
    scheduleHide();
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { unlockOrientation().catch(() => {}); }, []);

  // Mark body so page-level chrome (ChatWidget FAB, lesson title bleed-through)
  // can be hidden via CSS while the fullscreen reader is open.
  useEffect(() => {
    document.body.classList.add("nb-reader-open");
    return () => { document.body.classList.remove("nb-reader-open"); };
  }, []);

  // Android hardware-back sentinel: closes the reader instead of
  // navigating the enclosing lesson/course route.
  useEffect(() => {
    try { window.history.pushState({ overlay: true }, ""); } catch {}
    const onPop = () => {
      if (isSyntheticPop()) return;
      try { onBack(); } catch {}
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.overlay) {
        try { beginSyntheticPop(); window.history.back(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = () => {
    if (isFocus || autoScrollActive) return;
    setChromeVisible((v) => !v);
    scheduleHide();
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    if (onDownload) {
      setSaving(true);
      try { await onDownload(); } finally { setSaving(false); }
      return;
    }
    // Fallback: download as .md
    try {
      const blob = new Blob([resolvedMarkdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(title || "smart-notes").replace(/[^\w.-]+/g, "_")}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Smart Notes saved");
    } catch (err) {
      toast.error((err as Error)?.message || "Save failed");
    }
  };

  const handleSaveNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (noteSaving) return;
    try {
      await saveNote(draft, title);
      setEditing(false);
      toast.success("Smart Note saved");
    } catch (err) {
      toast.error((err as Error)?.message || "Save failed");
    }
  };


  // Stable ref object for AutoScrollFab.
  const targetRef = useMemo(() => scrollRef, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" style={{ isolation: "isolate" }} onClick={handleTap}>
      {/* Top chrome */}
      <header
        className={`safe-area-top absolute left-0 right-0 top-0 z-30 flex min-h-[48px] items-center gap-2 border-b bg-background px-3 shadow-sm transition-transform duration-300 ${
          chromeVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <EditableTitle
          value={note?.title || title}
          canEdit={isEditable && !!note}
          onSave={async (next) => {
            try { await saveNote(note?.content_md ?? "", next); toast.success("Renamed"); }
            catch (err) { toast.error((err as Error)?.message || "Rename failed"); }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); void copyText(resolvedMarkdown); }}
          aria-label="Copy markdown"
          title="Copy markdown"
        >
          <Copy className="h-5 w-5" />
        </Button>
        {isEditable && !editing && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setDraft(resolvedMarkdown); setEditing(true); setChromeVisible(true); }}
            aria-label="Edit note"
            title="Edit note"
            disabled={noteLoading}
          >
            <Pencil className="h-5 w-5" />
          </Button>
        )}
        {isEditable && editing && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); setEditing(false); setDraft(resolvedMarkdown); }}
              aria-label="Discard changes"
              title="Discard"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={handleSaveNote}
              aria-label="Save note"
              title="Save"
              disabled={noteSaving}
            >
              {noteSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            </Button>
          </>
        )}
        <ReadingToggleButton
          mode={readingMode}
          onTap={() => {
            // Tap cycles: off → theme → off (theme keeps chrome visible).
            setReadingMode((m) => (m === "off" ? "theme" : "off"));
          }}
          onLongPress={() => {
            // Long-press jumps straight into distraction-free focus mode.
            setReadingMode("focus");
            setChromeVisible(false);
          }}
        />
      </header>


      {/* Sepia overlay during reading mode (theme + focus) */}
      {isReaderTheme && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{ backgroundColor: "rgba(244, 208, 144, 0.18)", mixBlendMode: "multiply" }}
          aria-hidden="true"
        />
      )}
      {/* Exit pill — only in distraction-free focus mode */}
      {isFocus && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setReadingMode("off"); setChromeVisible(true); scheduleHide(); }}
          aria-label="Exit reading mode"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className="fixed right-3 z-40 flex h-9 items-center gap-1.5 rounded-full bg-foreground/70 px-3 text-xs font-medium text-background backdrop-blur active:scale-95"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Reading
        </button>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
          // Bottom border = 0 — drop the 96 px reserved gutter so the
          // attachment / notes go edge-to-edge. FABs still float above
          // via z-40 + safe-area-bottom utility.
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); scheduleAutoSave(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Apne notes likho — Markdown supported (## heading, **bold**, - bullet, [[Wikilink]])."
              className="min-h-[60vh] w-full resize-none border border-border bg-card font-mono text-sm leading-relaxed"
            />
          ) : noteLoading && isEditable ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your notes…
            </div>
          ) : (
            <ObsidianMarkdown onOpenLink={onOpenLink}>{resolvedMarkdown}</ObsidianMarkdown>
          )}
        </div>

      </div>

      {/* AutoScroll FAB */}
      {notesAutoScrollEnabled && (
      <AutoScrollFab
        targetRef={targetRef}
        bottomOffset={96}
        onActiveChange={(a) => {
          setAutoScrollActive(a);
          if (a) setChromeVisible(false);
          else if (!readingMode) { setChromeVisible(true); scheduleHide(); }
        }}
      />
      )}

      {/* Rotate FAB — custom phone-rotate icon (no PNG, counter-clockwise arrow). */}
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          const next = !landscape;
          setLandscape(next);
          const ok = next ? await lockOrientation("landscape") : (await unlockOrientation(), true);
          // A11y feedback so the user knows the tap registered even when
          // the WebView fails silently (older Android, system orientation off).
          if (next && !ok) {
            toast("Rotate device manually — your phone may have auto-rotate disabled.", { duration: 2200 });
          }
          scheduleHide();
        }}
        aria-label={landscape ? "Exit landscape" : "Rotate to landscape"}
        aria-pressed={landscape}
        title="Rotate to landscape"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
        className={`fixed left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-card/90 p-2 text-foreground shadow-md ring-1 ring-black/10 backdrop-blur transition-all duration-300 active:scale-95 ${
          chromeVisible || readingMode !== "off" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <RotatePhoneIcon className={`h-6 w-6 transition-transform ${landscape ? "rotate-90" : ""}`} />
      </button>

      {/* Download FAB */}
      <div className={`transition-opacity duration-300 ${chromeVisible && !readingMode ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <button
          type="button"
          onClick={handleSave}
          aria-label="Save Smart Notes"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          className="fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform active:scale-95"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}