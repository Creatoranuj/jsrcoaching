import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Lovable-style toast: floating card, rounded-2xl, hairline shadow,
 * top-center, colored status icons in a subtle tinted circle.
 * See mem://design/lovable-dialog (same visual grammar).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      className="toaster group"
      position="top-center"
      offset={16}
      gap={8}
      /* One toast at a time: stacked duplicates were covering the course
         cards on mobile (see screenshot report). */
      visibleToasts={1}
      expand={false}
      closeButton
      /* Swipe up to dismiss — the strip sits at top-center. */
      swipeDirections={["top", "left", "right"]}
      toastOptions={{
        duration: 2500,
        classNames: {
          toast: [
            "group toast pointer-events-auto",
            "flex items-center gap-3",
            "!w-[min(92vw,380px)] p-3",
            "!rounded-2xl !border !border-border/60 !bg-background !text-foreground",
            "!shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
            "backdrop-blur-sm",
          ].join(" "),
          title: "text-sm font-medium leading-snug text-foreground",
          description: "text-xs text-foreground/60 leading-snug mt-0.5",
          icon: "shrink-0 flex items-center justify-center h-6 w-6 rounded-full",
          actionButton:
            "group-[.toast]:h-7 group-[.toast]:px-3 group-[.toast]:rounded-full group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:text-xs group-[.toast]:font-medium",
          cancelButton:
            "group-[.toast]:h-7 group-[.toast]:px-3 group-[.toast]:rounded-full group-[.toast]:bg-muted group-[.toast]:text-foreground/70 group-[.toast]:text-xs",
          closeButton:
            "group-[.toast]:!bg-transparent group-[.toast]:!border-0 group-[.toast]:!text-foreground/40 hover:group-[.toast]:!text-foreground",
          success: "[&_[data-icon]]:bg-emerald-500/10 [&_[data-icon]>svg]:text-emerald-600",
          error: "[&_[data-icon]]:bg-destructive/10 [&_[data-icon]>svg]:text-destructive",
          warning: "[&_[data-icon]]:bg-amber-500/10 [&_[data-icon]>svg]:text-amber-600",
          info: "[&_[data-icon]]:bg-primary/10 [&_[data-icon]>svg]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
