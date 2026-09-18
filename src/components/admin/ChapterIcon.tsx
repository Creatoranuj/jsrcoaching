import { useResolvedContentUrl } from "../../hooks/useResolvedContentUrl";
import { cn } from "../../lib/utils";

interface ChapterIconProps {
  /** Raw stored value: `storage://content/...`, a Supabase URL, or any external link. */
  url?: string | null;
  /** Fallback shown when there is no icon (or it cannot be resolved). */
  fallbackLabel: string | number;
  className?: string;
}

/**
 * Renders a subject / chapter icon from whatever the admin saved — a storage
 * path (`storage://content/chapter-icons/...`) or a pasted external link.
 * Raw `storage://` values are NOT loadable by <img>, so they must go through
 * `resolveContentUrl` first; before this component the list rendered them
 * directly and every uploaded icon showed as a broken image.
 */
export function ChapterIcon({ url, fallbackLabel, className }: ChapterIconProps) {
  const { url: resolved, status } = useResolvedContentUrl(url ?? null);

  if (resolved && status === "ready") {
    return (
      <img
        src={resolved}
        alt=""
        className={cn("rounded-lg object-cover border border-border/40", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground",
        className
      )}
    >
      {fallbackLabel}
    </div>
  );
}
