import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";

type ReactMarkdownProps = ComponentProps<typeof ReactMarkdown>;

export interface MarkdownInnerProps extends Omit<ReactMarkdownProps, "remarkPlugins"> {
  children: string;
  /**
   * Default true. Set false to skip the GFM plugin (tables, task lists, strikethrough).
   */
  gfm?: boolean;
}

/**
 * Actual react-markdown renderer. Imported only via the lazy wrapper in
 * `src/components/Markdown.tsx` so that `react-markdown` + `remark-gfm`
 * stay out of the initial entry bundle.
 */
export default function MarkdownInner({ children, gfm = true, ...rest }: MarkdownInnerProps) {
  return (
    <ReactMarkdown
      {...rest}
      remarkPlugins={gfm ? [remarkGfm] : undefined}
    >
      {children}
    </ReactMarkdown>
  );
}
