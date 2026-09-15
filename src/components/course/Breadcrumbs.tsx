import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useNavigationHistory } from "../../contexts/NavigationHistoryContext";

const getScrollTop = () => {
  if (typeof window === "undefined") return 0;
  return (
    document.scrollingElement?.scrollTop ??
    document.documentElement.scrollTop ??
    window.scrollY ??
    0
  );
};

export interface BreadcrumbSegment {
  label: string;
  href?: string;
  /** Optional click handler; takes precedence over href for in-page state nav. */
  onClick?: () => void;
  icon?: React.ReactNode;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
  className?: string;
  /**
   * Optional explicit back handler. Takes precedence over auto-derivation.
   * When supplied, the leading back arrow always calls this.
   */
  onBack?: () => void;
  /**
   * When true (default), a leading back arrow is rendered.
   * Auto-target: previous segment's href, then real navigation trail
   * (so it converges with Android hardware back), then browser history.
   */
  showBack?: boolean;
}

/**
 * Premium Breadcrumbs — elegant navigation with glass morphism + leading
 * back button. Back-arrow targets, in order: previous segment href → real
 * in-app navigation trail (NavigationHistoryContext, matches hardware back)
 * → `onBack` → browser history.
 */
export const Breadcrumbs = ({
  segments,
  className,
  onBack,
  showBack = true,
}: BreadcrumbsProps) => {
  const navigate = useNavigate();
  const navHistory = useNavigationHistory();
  const params = useParams();
  const location = useLocation();
  if (!segments.length) return null;

  const handleBack = () => {
    if (onBack) return onBack();
    // Forced-path back: always walk the breadcrumb segments themselves so the
    // back arrow goes exactly one level up the visible path — never to some
    // unrelated route the user previously visited. Prefer the previous
    // segment's onClick (in-page overlay/state nav) before its href, since an
    // onClick handler is the segment's authoritative way to "go to" that level.
    for (let i = segments.length - 2; i >= 0; i -= 1) {
      const seg = segments[i];
      if (seg.onClick) {
        seg.onClick();
        return;
      }
      if (seg.href) {
        navigate(seg.href);
        return;
      }
    }
    // No prior segment is navigable (single-segment breadcrumb). Only now do
    // we consult the in-app trail / browser history, so the result still
    // matches Android hardware back.
    const prev = navHistory.peekPrevious();
    if (prev) {
      navigate(prev);
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <nav
      className={cn(
        "hidden md:flex",
        "items-center gap-1 text-xs overflow-x-auto whitespace-nowrap px-2 sm:px-3",
        "bg-gradient-to-r from-card/95 to-card/80 backdrop-blur-xl",
        "md:border-b md:border-border/40 md:shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]",
        "scrollbar-none py-0 md:py-2",
        className
      )}
      aria-label="Breadcrumb"
    >
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className={cn(
            "shrink-0 inline-flex items-center justify-center h-8 w-8 md:h-9 md:w-9 md:min-h-[44px] md:min-w-[44px] -ml-1 rounded-lg",
            "text-muted-foreground hover:text-primary hover:bg-primary/8",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
            "transition-all duration-150 active:scale-95 mr-0.5"
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <ol className="hidden md:flex items-center gap-1 list-none m-0 p-0">
      {segments.map((segment, index) => {
        const isFirst = index === 0;
        const isLast = index === segments.length - 1;

        return (
          <li key={segment.href ?? `${index}-${segment.label}`} className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <ChevronRight aria-hidden="true" className="h-3 w-3 text-primary/30 mx-0.5 shrink-0" />
            )}

            {isLast && !segment.onClick ? (
              <span
                aria-current="page"
                className={cn(
                  "px-2 py-1 rounded-lg transition-all max-w-[200px] truncate inline-flex items-center gap-1.5",
                  "font-bold text-primary bg-primary/8 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]"
                )}
              >
                {isFirst && !segment.icon && (
                  <Home className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {segment.icon}
                <span className="truncate">{segment.label}</span>
              </span>
            ) : !segment.href && !segment.onClick ? (
              <span
                className={cn(
                  "px-2 py-1 rounded-lg transition-all max-w-[200px] truncate inline-flex items-center gap-1.5",
                  "text-muted-foreground"
                )}
              >
                {isFirst && !segment.icon && (
                  <Home className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {segment.icon}
                <span className="truncate">{segment.label}</span>
              </span>
            ) : segment.onClick ? (
              <button
                type="button"
                onClick={() => {
                  if (import.meta.env.DEV) console.warn("[bc] click", {
                    label: segment.label,
                    isLast,
                    pathname: location.pathname,
                    search: location.search,
                    params,
                    scrollTop: getScrollTop(),
                  });
                  segment.onClick!();
                }}
                title={`Go to ${segment.label}`}
                className={cn(
                  "px-2 py-1 rounded-lg inline-flex items-center gap-1.5 max-w-[180px] cursor-pointer",
                  isLast
                    ? "font-semibold text-primary bg-primary/10 ring-1 ring-primary/20"
                    : "text-foreground/80 hover:text-primary hover:bg-primary/8 hover:underline underline-offset-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
                  "transition-all duration-150 active:scale-95",
                )}
              >
                {isFirst && !segment.icon && (
                  <Home className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                )}
                {segment.icon}
                <span className="truncate">{segment.label}</span>
              </button>
            ) : (
              <Link
                to={segment.href!}
                onClick={() => { if (import.meta.env.DEV) console.warn("[bc] link", { label: segment.label, href: segment.href, from: location.pathname, params, scrollTop: getScrollTop() }); }}
                title={`Go to ${segment.label}`}
                className={cn(
                  "px-2 py-1 rounded-lg inline-flex items-center gap-1.5 max-w-[180px] cursor-pointer",
                  "text-foreground/80 hover:text-primary hover:bg-primary/8 hover:underline underline-offset-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
                  "transition-all duration-150 active:scale-95",
                )}
              >
                {isFirst && !segment.icon && (
                  <Home className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                )}
                {segment.icon}
                <span className="truncate">{segment.label}</span>
              </Link>
            )}
          </li>
        );
      })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;

