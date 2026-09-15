import { Fragment, type ReactNode } from "react";

/**
 * Tiny Obsidian-flavoured markdown renderer for the note "Read" mode.
 *
 * Deliberately hand-rolled instead of pulling a parser: the note surface only
 * needs the subset kepano's own notes rely on (headings, bold/italic,
 * highlight, inline code, quotes, callouts, lists, tasks, wikilinks, rules).
 * A 4KB switch beats a 100KB dependency inside a reader sheet, and it can
 * never execute HTML from the note body — everything is rendered as React
 * text nodes, so a pasted `<script>` stays literal.
 */

interface Props {
  markdown: string;
  onOpenLink?: (name: string) => void;
}

const CALLOUT = /^>\s*\[!([a-z]+)\]\s*(.*)$/i;

/** Inline pass: `**b**`, `*i*`, `==mark==`, `` `code` ``, `[[link]]`. */
function inline(text: string, key: string, onOpenLink?: (name: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|==[^=\n]+==|`[^`\n]+`|\[\[[^[\]\n]+\]\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("==")) out.push(<mark key={k} className="rounded bg-primary/20 px-0.5 text-foreground">{tok.slice(2, -2)}</mark>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[[")) {
      const name = tok.slice(2, -2);
      out.push(
        <button
          key={k}
          type="button"
          onClick={() => onOpenLink?.(name)}
          className="text-primary underline decoration-primary/40 underline-offset-2"
        >
          {name}
        </button>,
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MarkdownPreview({ markdown, onOpenLink }: Props) {
  const lines = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").split("\n");
  const blocks: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `l${i}`;

    if (!line.trim()) continue;

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key} className="my-3 border-border" />);
      continue;
    }

    const callout = CALLOUT.exec(line);
    if (callout) {
      const body: string[] = callout[2] ? [callout[2]] : [];
      while (i + 1 < lines.length && lines[i + 1].startsWith(">")) {
        body.push(lines[++i].replace(/^>\s?/, ""));
      }
      blocks.push(
        <div key={key} className="my-2 rounded-xl border-l-4 border-primary bg-muted/50 px-3 py-2">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-primary">{callout[1]}</p>
          <p className="text-sm leading-relaxed">{inline(body.join("\n"), key, onOpenLink)}</p>
        </div>,
      );
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push(
        <blockquote key={key} className="my-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
          {inline(line.replace(/^>\s?/, ""), key, onOpenLink)}
        </blockquote>,
      );
      continue;
    }

    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      const level = head[1].length;
      const size = level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base";
      blocks.push(
        <p key={key} className={`mt-3 font-semibold leading-snug ${size}`}>
          {inline(head[2], key, onOpenLink)}
        </p>,
      );
      continue;
    }

    const task = /^\s*-\s\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      const done = task[1].toLowerCase() === "x";
      blocks.push(
        <p key={key} className="flex items-start gap-2 text-sm leading-relaxed">
          <span
            aria-hidden
            className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border text-[9px] ${
              done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
            }`}
          >
            {done ? "✓" : ""}
          </span>
          <span className={done ? "text-muted-foreground line-through" : ""}>{inline(task[2], key, onOpenLink)}</span>
        </p>,
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(
        <p key={key} className="flex items-start gap-2 text-sm leading-relaxed">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
          <span>{inline(bullet[1], key, onOpenLink)}</span>
        </p>,
      );
      continue;
    }

    const num = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (num) {
      blocks.push(
        <p key={key} className="flex items-start gap-2 text-sm leading-relaxed">
          <span className="shrink-0 tabular-nums text-foreground/60">{num[1]}.</span>
          <span>{inline(num[2], key, onOpenLink)}</span>
        </p>,
      );
      continue;
    }

    blocks.push(
      <p key={key} className="text-sm leading-relaxed">
        {inline(line, key, onOpenLink)}
      </p>,
    );
  }

  if (!blocks.length) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Abhi kuch likha nahi hai.</p>;
  }

  return <div className="space-y-1.5 px-4 py-3">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
