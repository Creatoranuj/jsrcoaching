import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Check,
  Link2,
  Share2,
  ExternalLink,
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Quote,
  Code,
  Highlighter,
  Eye,
  Pencil,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { getNote, saveNote, extractWikiLinks } from "../../../services/libraryNotes";
import { listAllFolders, listItems } from "../../../services/personalLibrary";
import {
  openInObsidian,
  revealInObsidian,
  shareNoteMarkdown,
  setVault,
  getVault,
  setVaultFolder,
  getVaultFolder,
  withFrontmatter,
  normalizeMarkdown,
  noteFilename,
  vaultFilePath,
} from "../../../lib/reader/noteExport";

import { Button } from "../../ui/button";
import NoteToolbar, { STYLE_PREFIX, type BlockStyle, type MoreAction } from "./NoteToolbar";
import MarkdownPreview from "./MarkdownPreview";

interface Props {
  /** Stable id of the item the note belongs to. */
  itemId: string;
  title?: string;
  /** Called when a [[wikilink]] is clicked. */
  onOpenLink?: (name: string) => void;
  /** Keyboard height (px) — shown in the debug badge when enabled. */
  keyboardInset?: number;
  /** Close the notes sheet (footer Cancel / Save & approve). */
  onClose?: () => void;
}


type Tool =
  | { kind: "wrap"; id: string; label: string; icon: typeof Bold; before: string; after: string }
  | { kind: "line"; id: string; label: string; icon: typeof List; prefix: string }
  | { kind: "insert"; id: string; label: string; icon: typeof Quote; text: string; caretBack?: number };

/** Obsidian-flavoured formatting tools (kepano conventions). */
const TOOLS: Tool[] = [
  { kind: "wrap", id: "bold", label: "Bold", icon: Bold, before: "**", after: "**" },
  { kind: "wrap", id: "italic", label: "Italic", icon: Italic, before: "*", after: "*" },
  { kind: "wrap", id: "mark", label: "Highlight", icon: Highlighter, before: "==", after: "==" },
  { kind: "wrap", id: "code", label: "Code", icon: Code, before: "`", after: "`" },
  { kind: "line", id: "h2", label: "Heading", icon: Heading2, prefix: "## " },
  { kind: "line", id: "list", label: "List", icon: List, prefix: "- " },
  { kind: "line", id: "task", label: "Task", icon: ListChecks, prefix: "- [ ] " },
  { kind: "insert", id: "callout", label: "Callout", icon: Quote, text: "> [!note]\n> " },
  { kind: "wrap", id: "link", label: "Wikilink", icon: Link2, before: "[[", after: "]]" },
];

/** Extra Obsidian snippets, second row. */
const SNIPPETS = [
  { label: "[!tip]", insert: "> [!tip]\n> " },
  { label: "[!warning]", insert: "> [!warning]\n> " },
  { label: "[!question]", insert: "> [!question]\n> " },
  { label: "^block", insert: " ^block-id" },
  { label: "---", insert: "\n---\n" },
];

function debugEnabled(): boolean {
  try {
    return localStorage.getItem("nb_kbd_debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Obsidian-style note editor. Auto-saves (debounced 800ms) to IndexedDB and
 * mirrors to MyLibrary/{itemId}/note.md on native devices.
 *
 * Deliberately a plain textarea with a formatting toolbar: the rich markdown
 * editor renders its input layer with its own stylesheet, which was never
 * imported, so the writing surface collapsed to zero height inside the reader
 * sheet. A textarea always gets focus + the on-screen keyboard in the WebView.
 */
export default function NotesPanel({ itemId, title, onOpenLink, keyboardInset = 0, onClose }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [askVault, setAskVault] = useState(false);
  const [vaultInput, setVaultInput] = useState("");
  const [folderInput, setFolderInput] = useState("");
  /** Mirrors localStorage so the header re-renders the moment a vault is set. */
  const [vault, setVaultName] = useState<string | null>(() => getVault());
  const [busy, setBusy] = useState<null | "obsidian" | "md">(null);

  const [titles, setTitles] = useState<string[]>([]);
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [debug, setDebug] = useState(debugEnabled);
  const [metrics, setMetrics] = useState({ vv: 0, top: 0, bottom: 0, h: 0, clipped: false });
  const [mode, setMode] = useState<"write" | "read">("write");
  /** Formatting state of the block/selection under the caret. */
  const [caretState, setCaretState] = useState<{ style: BlockStyle; bold: boolean; italic: boolean }>({
    style: "text",
    bold: false,
    italic: false,
  });

  const saveTimer = useRef<number | null>(null);
  /** Cleared on unmount so a late autosave can't setState on a dead sheet. */
  const statusTimer = useRef<number | null>(null);
  const focusTimer = useRef<number | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      if (focusTimer.current) window.clearTimeout(focusTimer.current);
    };
  }, []);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // IndexedDB can reject (private mode, quota, corrupted store). Without a
    // catch that becomes an unhandled rejection — which the crash shield treats
    // as a fatal signal — and the sheet stays stuck on its loading skeleton.
    getNote(itemId)
      .then((md) => {
        if (!alive) return;
        setValue(md);
        setLoading(false);
        // Focus once the surface exists so the keyboard comes up right away.
        focusTimer.current = window.setTimeout(() => areaRef.current?.focus(), 80);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        toast.error("Purana note load nahi hua", { description: "Naya note likh sakte ho." });
      });
    return () => {
      alive = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [itemId]);

  // Library titles power the `[[` autocomplete. Loaded once, best-effort.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const folders = await listAllFolders();
        const lists = await Promise.all(folders.map((f) => listItems(f.id, "name").catch(() => [])));
        if (!alive) return;
        const names = Array.from(
          new Set(lists.flat().map((i) => i.title.replace(/\.[a-z0-9]{1,5}$/i, "").trim())),
        ).filter(Boolean);
        setTitles(names);
      } catch {
        /* autocomplete is optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Bring the writing surface back into view. The sheet is lifted above the
   * keyboard by its host, but the browser can still leave the textarea partly
   * off-screen right after focus (and again after a rotation, when the
   * keyboard height changes). `nearest` avoids yanking the whole reader.
   */
  const revealArea = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);

  /** Debug badge data: how much of the textarea is actually on screen. */
  const sampleMetrics = useCallback(() => {
    const el = areaRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const r = el.getBoundingClientRect();
    const viewBottom = vv.offsetTop + vv.height;
    const visible = Math.max(0, Math.min(r.bottom, viewBottom) - Math.max(r.top, vv.offsetTop));
    setMetrics({
      vv: Math.round(vv.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(visible),
      clipped: visible < Math.min(r.height, 80),
    });
  }, []);

  // Re-reveal while the field is focused and the viewport changes: keyboard
  // open/close, rotation, or an accessory bar appearing.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (focusedRef.current) window.setTimeout(revealArea, 60);
      if (debug) window.setTimeout(sampleMetrics, 80);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [debug, revealArea, sampleMetrics]);

  useEffect(() => {
    if (debug && focused) sampleMetrics();
  }, [debug, focused, keyboardInset, sampleMetrics]);

  const onChange = useCallback(
    (md: string) => {
      setValue(md);
      setStatus("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        // Fire-and-forget, but never unhandled: a rejected write must surface
        // as an "unsaved" badge, not as a global rejection event.
        saveNote(itemId, md)
          .then(() => {
            if (!aliveRef.current) return;
            setStatus("saved");
            statusTimer.current = window.setTimeout(() => {
              if (aliveRef.current) setStatus("idle");
            }, 1500);
          })
          .catch(() => {
            if (aliveRef.current) setStatus("error");
          });
      }, 800);
    },
    [itemId],
  );

  /** Detect an open `[[query` right before the caret + the caret's block style. */
  const syncLinkQuery = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const before = el.value.slice(0, start);
    const m = /\[\[([^[\]\n]*)$/.exec(before);
    setLinkQuery(m ? m[1] : null);

    const lineStart = before.lastIndexOf("\n") + 1;
    const lineEnd = el.value.indexOf("\n", start);
    const line = el.value.slice(lineStart, lineEnd === -1 ? el.value.length : lineEnd);
    const heading = /^(#{1,3})\s/.exec(line);
    const style: BlockStyle = heading
      ? (["title", "heading", "subheading"][heading[1].length - 1] as BlockStyle)
      : "text";
    const selected = el.value.slice(start, el.selectionEnd ?? start);
    const probe = selected || line;
    setCaretState({
      style,
      bold: /\*\*[^*]+\*\*/.test(probe),
      italic: /(^|[^*])\*[^*\n]+\*/.test(probe),
    });
  }, []);


  const applyTool = useCallback(
    (tool: Tool) => {
      const el = areaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const selected = el.value.slice(start, end);
      let next = el.value;
      let caret = start;

      if (tool.kind === "wrap") {
        next = el.value.slice(0, start) + tool.before + selected + tool.after + el.value.slice(end);
        caret = selected ? start + tool.before.length + selected.length + tool.after.length : start + tool.before.length;
      } else if (tool.kind === "line") {
        const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
        const already = el.value.slice(lineStart).startsWith(tool.prefix);
        next = already
          ? el.value.slice(0, lineStart) + el.value.slice(lineStart + tool.prefix.length)
          : el.value.slice(0, lineStart) + tool.prefix + el.value.slice(lineStart);
        caret = start + (already ? -tool.prefix.length : tool.prefix.length);
      } else {
        next = el.value.slice(0, start) + tool.text + el.value.slice(end);
        caret = start + tool.text.length - (tool.caretBack ?? 0);
      }

      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const safe = Math.max(0, Math.min(caret, next.length));
        el.setSelectionRange(safe, safe);
        syncLinkQuery();
      });
    },
    [onChange, syncLinkQuery],
  );

  /**
   * Lovable-style block styles map onto markdown heading levels: the current
   * line's `#` prefix is swapped, never stacked, so switching Title → Text
   * always lands on a clean line.
   */
  const applyStyle = useCallback(
    (style: BlockStyle) => {
      const el = areaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = el.value.indexOf("\n", start);
      const end = lineEnd === -1 ? el.value.length : lineEnd;
      const line = el.value.slice(lineStart, end);
      const stripped = line.replace(/^#{1,6}\s*/, "");
      const prefix = STYLE_PREFIX[style];
      const next = el.value.slice(0, lineStart) + prefix + stripped + el.value.slice(end);
      const caret = Math.max(lineStart, start + (prefix.length - (line.length - stripped.length)));
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
        syncLinkQuery();
      });
    },
    [onChange, syncLinkQuery],
  );



  /** Replace the in-progress `[[query` with a full `[[Name]]`. */
  const completeLink = useCallback(
    (name: string) => {
      const el = areaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, start);
      const m = /\[\[([^[\]\n]*)$/.exec(before);
      if (!m) return;
      const from = start - m[1].length;
      const next = `${el.value.slice(0, from)}${name}]]${el.value.slice(start)}`;
      onChange(next);
      const caret = from + name.length + 2;
      setLinkQuery(null);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [onChange],
  );

  const suggestions = useMemo(() => {
    if (linkQuery === null) return [];
    const q = linkQuery.toLowerCase();
    return titles.filter((t) => t.toLowerCase().includes(q)).slice(0, 6);
  }, [linkQuery, titles]);

  const flush = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await saveNote(itemId, value);
  }, [itemId, value]);

  /** `flush` that reports instead of throwing — for click handlers. */
  const flushSafe = useCallback(async () => {
    try {
      await flush();
      return true;
    } catch {
      if (aliveRef.current) setStatus("error");
      toast.error("Note save nahi hua", { description: "Dobara try karo — text yahin surakshit hai." });
      return false;
    }
  }, [flush]);

  /** Note as it leaves the app: normalised body + Obsidian Properties block. */
  const exportBody = useCallback(
    () => withFrontmatter(normalizeMarkdown(value), { title }),
    [title, value],
  );

  const doObsidian = useCallback(async () => {
    if (!value.trim()) {
      toast.info("Note khaali hai — pehle kuch likho.");
      return;
    }
    // Export must never run ahead of the local save: if the disk write fails
    // we stop here, so the user is not told "sent to Obsidian" while the
    // in-app copy is silently gone.
    setBusy("obsidian");
    try {
      if (!(await flushSafe())) return;
      const res = await openInObsidian(title || "Note", exportBody());
      if (res === "needs-vault") {
        setVaultInput(getVault() ?? "");
        setFolderInput(getVaultFolder() ?? "");
        setAskVault(true);
        toast.info("Pehle vault ka naam batao", { description: "Ek baar — phir yaad rahega." });
      } else if (res === "fell-back") {
        toast.message("Obsidian nahi khula", {
          description: "Note .md file ke roop me share/download kar diya gaya hai — vault folder me daal do.",
        });
      } else {
        toast.success(`Obsidian me bheja — ${getVault()}`, {
          description: `${vaultFilePath(title, getVaultFolder())}.md`,
        });
      }
    } catch {
      toast.error("Obsidian me nahi khul paya.", { description: "'.md' se export karke vault folder me save karo." });
    } finally {
      setBusy(null);
    }
  }, [exportBody, flushSafe, title, value]);

  const doShare = useCallback(async () => {
    if (!value.trim()) {
      toast.info("Note khaali hai — pehle kuch likho.");
      return;
    }
    setBusy("md");
    try {
      if (!(await flushSafe())) return;
      const ok = await shareNoteMarkdown(title || "Note", exportBody());
      // `false` = the user dismissed the share sheet; that is not an error and
      // must not claim success.
      if (ok) toast.success("Note export ho gaya", { description: noteFilename(title) });
    } catch {
      toast.error("Note export nahi ho paya.");
    } finally {
      setBusy(null);
    }
  }, [exportBody, flushSafe, title, value]);

  const confirmVault = useCallback(async () => {
    const name = vaultInput.trim();
    if (!name) {
      toast.info("Vault ka naam likho — Obsidian me jo folder dikhta hai wahi.");
      return;
    }
    setVault(name);
    setVaultFolder(folderInput);
    setVaultName(name);
    setAskVault(false);
    toast.success(`Vault set: ${name}`, { description: "Agli baar seedha yahi khulega." });
    await doObsidian();
  }, [doObsidian, folderInput, vaultInput]);


  const openVaultEditor = useCallback(() => {
    setVaultInput(getVault() ?? "");
    setFolderInput(getVaultFolder() ?? "");
    setAskVault(true);
  }, []);

  const links = extractWikiLinks(value);

  /** Overflow menu of the floating toolbar: Obsidian-specific writing tools. */
  const moreActions: MoreAction[] = useMemo(
    () => [
      { id: "mark", label: "Highlight  ==text==", run: () => applyTool(TOOLS[2]) },
      { id: "code", label: "Inline code", run: () => applyTool(TOOLS[3]) },
      { id: "task", label: "Task  - [ ]", run: () => applyTool(TOOLS[6]) },
      { id: "callout", label: "Callout  [!note]", run: () => applyTool(TOOLS[7]) },
      { id: "link", label: "Wikilink  [[ ]]", run: () => applyTool(TOOLS[8]) },
      ...SNIPPETS.map((s) => ({
        id: s.label,
        label: s.label,
        run: () => applyTool({ kind: "insert" as const, id: s.label, label: s.label, icon: Quote, text: s.insert }),
      })),
    ],
    [applyTool],
  );


  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      {debug && focused && (
        <div className="pointer-events-none absolute right-2 top-11 z-10 rounded-md bg-foreground/85 px-2 py-1 font-mono text-[10px] leading-tight text-background">
          <div>kbd {keyboardInset}px · vv {metrics.vv}px</div>
          <div>
            area {metrics.top}→{metrics.bottom} · vis {metrics.h}px
          </div>
          {metrics.clipped && <div className="text-destructive-foreground">⚠ clipped</div>}
        </div>
      )}

      {/* Header — title/status on top, export actions on their own row so
          nothing gets squeezed on a 360dp phone. */}
      <div className="shrink-0 border-b px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                // Long-press-free toggle: tapping the title reveals metrics.
                const next = !debug;
                setDebug(next);
                try {
                  if (next) localStorage.setItem("nb_kbd_debug", "1");
                  else localStorage.removeItem("nb_kbd_debug");
                } catch { /* private mode */ }
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="nb-tap-exempt block max-w-full truncate text-left text-[15px] font-semibold leading-tight"
              title="Tap to toggle keyboard debug"
            >
              Notes
            </button>
            {title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            {status === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> saving
              </>
            )}
            {status === "saved" && (
              <>
                <Check className="h-3 w-3 text-primary" /> saved
              </>
            )}
            {status === "error" && <span className="text-destructive">save failed</span>}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {/* Vault chip — always visible so the destination is never a mystery. */}
          <button
            type="button"
            onClick={openVaultEditor}
            className="nb-tap-exempt inline-flex min-w-0 max-w-[45%] items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
            title="Vault / folder badlo"
          >
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{vault ? `${vault}${getVaultFolder() ? `/${getVaultFolder()}` : ""}` : "Vault set karo"}</span>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {vault && (
              <Button
                variant="ghost"
                size="icon"
                className="nb-tap-exempt h-8 w-8"
                aria-label="Vault me kholo"
                title="Obsidian vault me kholo"
                onClick={() => void revealInObsidian(title || "Note")}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="nb-tap-exempt h-8 w-8"
              aria-label="Note .md file me export karo"
              title="Export as .md"
              disabled={busy !== null}
              onClick={doShare}
            >
              {busy === "md" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              disabled={busy !== null}
              onClick={doObsidian}
              title={vault ? `Vault: ${vault}` : "Obsidian vault set karo"}
            >
              {busy === "obsidian" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              )}
              Obsidian
            </Button>
          </div>
        </div>
      </div>


      {askVault && (
        <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Obsidian vault ka naam — bilkul wahi jo Obsidian me dikhta hai (case sensitive).
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmVault();
                if (e.key === "Escape") setAskVault(false);
              }}
              placeholder="Vault, e.g. Naveen Bharat"
              className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-base outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" className="h-8" disabled={!vaultInput.trim()} onClick={() => void confirmVault()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setAskVault(false)}>
              Cancel
            </Button>
          </div>
          <input
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmVault();
              if (e.key === "Escape") setAskVault(false);
            }}
            placeholder="Folder (optional), e.g. PDF Notes"
            className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Note yahan jayega:{" "}
            <span className="font-medium">
              {vaultInput.trim() || "vault"}/{vaultFilePath(title, folderInput)}.md
            </span>
          </p>
        </div>
      )}

      {suggestions.length > 0 && mode === "write" && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b bg-muted/40 px-3 py-1.5">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => completeLink(name)}
              className="nb-tap-exempt inline-flex max-w-[60%] items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background"
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : mode === "read" ? (
          <MarkdownPreview markdown={value} onOpenLink={onOpenLink} />
        ) : (
          <textarea
            ref={areaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              syncLinkQuery();
            }}
            onKeyUp={syncLinkQuery}
            onClick={syncLinkQuery}
            onSelect={syncLinkQuery}
            onFocus={() => {
              focusedRef.current = true;
              setFocused(true);
              // Keyboard animation takes ~250ms on Android; re-check after it.
              revealArea();
              window.setTimeout(revealArea, 320);
              window.setTimeout(sampleMetrics, 360);
            }}
            onBlur={() => {
              focusedRef.current = false;
              setFocused(false);
              setLinkQuery(null);
              void flush();
            }}
            spellCheck={false}
            placeholder="Yahan likho… **bold**, *italic*, [[wikilinks]] se PDFs jodo"
            className="h-full min-h-[40vh] w-full resize-none border-0 bg-transparent px-4 py-3 text-base leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
        )}
      </div>

      {links.length > 0 && (
        <div className="shrink-0 border-t px-4 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Linked</p>
          <div className="flex flex-wrap gap-1.5">
            {links.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onOpenLink?.(name)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground/80"
              >
                <Link2 className="h-3 w-3" /> {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating composer toolbar — Lovable plan editor grammar */}
      {mode === "write" && !loading && (
        <NoteToolbar
          style={caretState.style}
          bold={caretState.bold}
          italic={caretState.italic}
          onStyle={applyStyle}
          onBold={() => applyTool(TOOLS[0] as Tool)}
          onItalic={() => applyTool(TOOLS[1] as Tool)}
          onList={() => applyTool(TOOLS[5] as Tool)}
          more={moreActions}
        />
      )}

      {/* Footer — read/write switch + Cancel / Save */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-t bg-background px-3 py-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-full px-3 text-sm"
          onClick={() => setMode(mode === "write" ? "read" : "write")}
        >
          {mode === "write" ? <BookOpen className="mr-1.5 h-4 w-4" /> : <Pencil className="mr-1.5 h-4 w-4" />}
          {mode === "write" ? "Read" : "Write"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-sm" onClick={() => onClose?.()}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-full px-4 text-sm font-medium"
            onClick={async () => {
              // Only dismiss once the write actually landed — closing on a
              // failed save silently loses the note.
              if (!(await flushSafe())) return;
              setStatus("saved");
              toast.success("Note save ho gaya");
              onClose?.();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>

  );
}
