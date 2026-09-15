import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Lovable-style empty state: gradient tile → title → muted subtitle.
 * See skill: lovable-design-language ("Empty state").
 */
export default function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-4", className)}>
      <div
        aria-hidden
        className="h-12 w-12 rounded-2xl mb-4 bg-gradient-to-br from-primary via-purple-500 to-destructive shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]"
      />
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-foreground/60 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
