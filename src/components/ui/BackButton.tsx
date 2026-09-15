import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useNavigationHistory } from "../../contexts/NavigationHistoryContext";
import { selectionHaptic } from "../../lib/native/haptics";

interface BackButtonProps {
  /** Fallback route when history stack is empty (cold launch / deep link). */
  fallback?: string;
  className?: string;
  label?: string;
  /** Retained for API compatibility. Ignored — Lovable-style back is always ghost. */
  variant?: "ghost" | "outline" | "default";
  /** "onPrimary" inverts ink for use on a `bg-primary` header. */
  tone?: "default" | "onPrimary";
}

/**
 * Lovable-style back nav: ghost, muted ink at rest, subtle muted fill on hover,
 * 44px touch target with visually compact 16px icon.
 * Pops real navigation stack first, falls back on cold launch / deep link.
 * See skill: lovable-design-language.
 */
export const BackButton = ({
  fallback = "/dashboard",
  className,
  label,
  tone = "default",
}: BackButtonProps) => {
  const navigate = useNavigate();
  const { peekPrevious } = useNavigationHistory();

  const handleClick = () => {
    void selectionHaptic();
    const prev = peekPrevious();
    if (prev) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  const toneClasses =
    tone === "onPrimary"
      ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 active:bg-primary-foreground/15"
      : "text-foreground/70 hover:text-foreground hover:bg-muted/60 active:bg-muted";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Go back"
      className={cn(
        "shrink-0 inline-flex items-center justify-center gap-1.5",
        "-ml-1 px-1.5 py-1 rounded-lg text-sm",
        "min-h-[44px] min-w-[44px]",
        "transition-colors duration-150",
        toneClasses,
        "[@media(hover:none)]:active:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
      {label && <span>{label}</span>}
    </button>
  );
};

export default BackButton;
