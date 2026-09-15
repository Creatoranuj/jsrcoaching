import { useState } from "react";
import { Bold, Check, ChevronUp, Italic, List, Plus } from "lucide-react";

/**
 * Lovable-style floating composer toolbar for the note editor.
 *
 * Design language: ghost by default, one pill surface (`rounded-full`) with a
 * single outline shadow, weight-over-color for the active state, motion at
 * 150/200ms. The style dropdown mirrors Lovable's Title / Heading /
 * Subheading / Text menu and maps 1:1 onto markdown heading levels.
 */

export type BlockStyle = "title" | "heading" | "subheading" | "text";

export const STYLE_PREFIX: Record<BlockStyle, string> = {
  title: "# ",
  heading: "## ",
  subheading: "### ",
  text: "",
};

const STYLE_LABEL: Record<BlockStyle, string> = {
  title: "Title",
  heading: "Heading",
  subheading: "Subheading",
  text: "Text",
};

const STYLES: BlockStyle[] = ["title", "heading", "subheading", "text"];

export interface MoreAction {
  id: string;
  label: string;
  run: () => void;
}

interface Props {
  style: BlockStyle;
  bold: boolean;
  italic: boolean;
  onStyle: (style: BlockStyle) => void;
  onBold: () => void;
  onItalic: () => void;
  onList: () => void;
  more: MoreAction[];
}

const ghost =
  "flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors duration-150 " +
  "[@media(hover:hover)]:hover:bg-muted/60 [@media(hover:hover)]:hover:text-foreground active:bg-muted";

export default function NoteToolbar({
  style,
  bold,
  italic,
  onStyle,
  onBold,
  onItalic,
  onList,
  more,
}: Props) {
  const [open, setOpen] = useState<null | "style" | "more">(null);
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="pointer-events-none relative flex justify-center px-3 pb-2">
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => setOpen(null)}
          className="pointer-events-auto fixed inset-0 z-0 cursor-default"
        />
      )}

      <div className="pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-full bg-background p-1 shadow-[0_0_0_1px_hsl(var(--border)),0_2px_8px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={bold}
          onMouseDown={keepFocus}
          onClick={onBold}
          className={`nb-tap-exempt ${ghost} ${bold ? "bg-muted font-semibold text-foreground" : ""}`}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={italic}
          onMouseDown={keepFocus}
          onClick={onItalic}
          className={`nb-tap-exempt ${ghost} ${italic ? "bg-muted text-foreground" : ""}`}
        >
          <Italic className="h-4 w-4" />
        </button>

        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

        {/* Style dropdown — Title / Heading / Subheading / Text */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === "style"}
            onMouseDown={keepFocus}
            onClick={() => setOpen(open === "style" ? null : "style")}
            className="nb-tap-exempt flex h-9 items-center gap-1.5 rounded-full bg-muted/70 px-3 text-sm font-medium text-foreground transition-colors duration-150"
          >
            {STYLE_LABEL[style]}
            <ChevronUp
              className={`h-4 w-4 text-foreground/60 transition-transform duration-200 ${
                open === "style" ? "" : "rotate-180"
              }`}
            />
          </button>
          {open === "style" && (
            <div
              role="menu"
              className="absolute bottom-11 left-1/2 z-20 w-44 -translate-x-1/2 overflow-hidden rounded-2xl bg-background py-1 shadow-[0_0_0_1px_hsl(var(--border)),0_8px_24px_rgba(0,0,0,0.12)]"
            >
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={style === s}
                  onMouseDown={keepFocus}
                  onClick={() => {
                    onStyle(s);
                    setOpen(null);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] transition-colors duration-150 active:bg-muted [@media(hover:hover)]:hover:bg-muted/60"
                >
                  <span className={s === "text" ? "" : "font-semibold"}>{STYLE_LABEL[s]}</span>
                  {style === s && <Check className="h-4 w-4 text-foreground/70" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="List"
          onMouseDown={keepFocus}
          onClick={onList}
          className={`nb-tap-exempt ${ghost}`}
        >
          <List className="h-4 w-4" />
        </button>

        {more.length > 0 && (
          <div className="relative">
            <button
              type="button"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={open === "more"}
              onMouseDown={keepFocus}
              onClick={() => setOpen(open === "more" ? null : "more")}
              className={`nb-tap-exempt ${ghost}`}
            >
              <Plus className="h-4 w-4" />
            </button>
            {open === "more" && (
              <div
                role="menu"
                className="absolute bottom-11 right-0 z-20 w-52 overflow-hidden rounded-2xl bg-background py-1 shadow-[0_0_0_1px_hsl(var(--border)),0_8px_24px_rgba(0,0,0,0.12)]"
              >
                {more.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitem"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      a.run();
                      setOpen(null);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm transition-colors duration-150 active:bg-muted [@media(hover:hover)]:hover:bg-muted/60"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
