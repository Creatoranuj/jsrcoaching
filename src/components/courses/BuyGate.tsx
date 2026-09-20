/**
 * BuyGate
 * =======
 * Single place that decides whether a course's Buy button is visible.
 *
 * Wrap every Buy / Buy Now / Buy Course control in this component. When the
 * admin has switched enrollment off (or the seat limit is reached) the button
 * is replaced by a "Batch Full" chip, so nobody can start a payment for a
 * closed batch. Students who already own the course are never gated.
 *
 * While the availability check is in flight we keep showing the button — a
 * flicker to "Batch Full" and back would be worse than a rare wasted tap, and
 * the database refuses the enrollment anyway.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCourseAvailability } from "@/hooks/useCourseAvailability";

interface BuyGateProps {
  courseId: number | string | null | undefined;
  /** The Buy control to render while enrollment is open. */
  children: ReactNode;
  /** Already-enrolled students bypass the gate entirely. */
  enrolled?: boolean;
  /** Custom "closed" content. Defaults to the Batch Full chip. */
  fallback?: ReactNode;
  className?: string;
}

export const BatchFullChip = ({ className }: { className?: string }) => (
  <Badge
    variant="secondary"
    className={cn(
      "h-10 gap-1.5 rounded-xl border border-border/70 bg-muted px-3 text-xs font-semibold text-muted-foreground",
      className
    )}
  >
    <Lock className="h-3.5 w-3.5" />
    Batch Full
  </Badge>
);

export const BuyGate = ({ courseId, children, enrolled, fallback, className }: BuyGateProps) => {
  const { isFull, loading } = useCourseAvailability(courseId);

  if (enrolled || loading || !isFull) return <>{children}</>;

  return <>{fallback ?? <BatchFullChip className={className} />}</>;
};

export default BuyGate;
