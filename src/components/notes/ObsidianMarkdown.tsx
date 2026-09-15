import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { Markdown } from "../Markdown";
import { Info, Quote, AlertTriangle, Lightbulb, FileText, Link2 } from "lucide-react";
import type { ComponentProps } from "react";

type CalloutType = "info" | "quote" | "note" | "tip" | "warning" | "success" | "example";

const CALLOUT_META: Record<CalloutType, { label: string; cls: string; Icon: typeof Info }> = {
  info:    { label: "Info",    cls: "border-sky-400/70 bg-sky-50 dark:bg-sky-950/40",           Icon: Info },
  quote:   { label: "Quote",   cls: "border-violet-400/70 bg-violet-50 dark:bg-violet-950/30",  Icon: Quote },
  note:    { label: "Note",    cls: "border-slate-400/70 bg-slate-50 dark:bg-slate-900/40",     Icon: FileText },
  tip:     { label: "Tip",     cls: "border-emerald-400/70 bg-emerald-50 dark:bg-emerald-950/40", Icon: Lightbulb },
  warning: { label: "Warning", cls: "border-amber-500/70 bg-amber-50 dark:bg-amber-950/40",     Icon: AlertTriangle },
  success: { label: "Success", cls: "border-green-500/70 bg-green-50 dark:bg-green-950/40",     Icon: Lightbulb },
  example: { label: "Example", cls: "border-fuchsia-400/70 bg-fuchsia-50 dark:bg-fuchsia-950/30", Icon: FileText },
};

/**
 * Pre-process Obsidian-isms before handing the markdown to react-markdown:
 *  - `[[Wikilink|alias]]` → `[alias](#nb-wiki:Wikilink)` so it renders as a link
 *    we can style and (optionally) intercept with onOpenLink.
 */
function preprocess(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [target, alias] = inner.split("|").map((s) => s.trim());
    const label = alias || target;
    return `[${label}](#nb-wiki:${encodeURIComponent(target)})`;
  });
}


function extractText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  const n = node as { props?: { children?: unknown } };
  if (n?.props?.children !== undefined) return extractText(n.props.children);
  return "";
}

interface Props {
  children: string;
  onOpenLink?: (name: string) => void;
}

/**
 * Obsidian-flavoured markdown: callouts (`> [!info]`), wikilinks (`[[Name]]`),
 * GFM tables/lists, fenced code, task lists. Renders inside an article using
 * the project's `.markdown-body flexoki` look + extra polish for tables/code.
 */
export function ObsidianMarkdown({ children, onOpenLink }: Props) {
  const md = useMemo(() => preprocess(children), [children]);

  const components: ComponentProps<typeof Markdown>["components"] = {
    blockquote(props) {
      // Detect "[!type] Title" on the first paragraph of the blockquote.
      const kids = Children.toArray(props.children as ReactNode);
      const firstP = kids.find((c) => isValidElement(c) && (c.type === "p" || (c as { props?: unknown })?.props));
      const firstText = extractText(firstP).trim();
      const m = /^\[!(\w+)\]\s*(.*)$/.exec(firstText);
      const callout = m
        ? { type: (CALLOUT_META[m[1].toLowerCase() as CalloutType] ? (m[1].toLowerCase() as CalloutType) : "note"), title: (m[2] || "").trim() }
        : null;
      if (!callout) {
        return (
          <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-4 pr-3 py-2 my-3 italic text-foreground/90 rounded-r-md">
            {props.children}
          </blockquote>
        );
      }
      const meta = CALLOUT_META[callout.type];
      // Drop the first paragraph (the "[!type] Title" line) — keep the rest.
      const firstIdx = kids.findIndex((c) => c === firstP);
      const rest = firstIdx >= 0 ? [...kids.slice(0, firstIdx), ...kids.slice(firstIdx + 1)] : kids;
      return (
        <div className={`my-4 rounded-lg border-l-4 ${meta.cls} px-3 py-2.5 not-italic`}>
          <div className="flex items-center gap-1.5 font-semibold text-foreground text-[13px] mb-1">
            <meta.Icon className="h-3.5 w-3.5" />
            {callout.title || meta.label}
          </div>
          <div className="text-[14px] leading-relaxed [&_p:last-child]:mb-0 [&_p]:my-1.5">
            {rest}
          </div>
        </div>
      );
    },
    a({ href, children: linkChildren, ...rest }) {
      const wikiPrefix = "#nb-wiki:";
      if (href?.startsWith(wikiPrefix)) {
        const name = decodeURIComponent(href.slice(wikiPrefix.length));
        return (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onOpenLink?.(name); }}
            className="inline-flex items-center gap-0.5 px-1 rounded text-primary bg-primary/10 hover:bg-primary/20 font-medium no-underline"
            title={`Wikilink: ${name}`}
          >
            <Link2 className="h-3 w-3" />
            {linkChildren}
          </button>
        );
      }
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
          {linkChildren}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[13px]">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return <th className="border-b border-border bg-muted/60 px-3 py-2 text-left font-semibold">{children}</th>;
    },
    td({ children }) {
      return <td className="border-b border-border/60 px-3 py-2 align-top">{children}</td>;
    },
    code({ className, children, ...rest }) {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono text-foreground" {...rest}>
            {children}
          </code>
        );
      }
      return (
        <code className={`${className ?? ""} block`} {...rest}>{children}</code>
      );
    },
    pre({ children }) {
      return (
        <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed font-mono">
          {children}
        </pre>
      );
    },
    ul({ children }) {
      return <ul className="my-2 list-disc pl-5 space-y-1 marker:text-primary">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="my-2 list-decimal pl-5 space-y-1 marker:text-primary marker:font-semibold">{children}</ol>;
    },
    li({ children }) {
      return <li className="leading-relaxed">{children}</li>;
    },
    h1({ children }) { return <h1 className="text-2xl font-bold mt-6 mb-3 tracking-tight">{children}</h1>; },
    h2({ children }) { return <h2 className="text-xl font-bold mt-5 mb-2 tracking-tight">{children}</h2>; },
    h3({ children }) { return <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>; },
    hr() { return <hr className="my-5 border-border" />; },
  };

  return (
    <article className="markdown-body flexoki text-[15px] leading-[1.7] text-foreground" style={{ background: "transparent" }}>
      <Markdown components={components}>{md}</Markdown>
    </article>
  );
}

export default ObsidianMarkdown;