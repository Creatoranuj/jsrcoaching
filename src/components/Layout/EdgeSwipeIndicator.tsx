import { useEffect, useState } from "react";

/**
 * Edge-swipe visual affordance — only visible while the user is actively
 * dragging from the left edge. Fades in with the drag progress (0..1) and
 * disappears the moment the gesture ends. No idle chrome, so the app stays
 * clean like Lovable.
 */
export default function EdgeSwipeIndicator() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ progress: number }>).detail;
      setProgress(Math.max(0, Math.min(1, detail?.progress ?? 0)));
    };
    window.addEventListener("edge-swipe-progress", onProgress);
    return () => window.removeEventListener("edge-swipe-progress", onProgress);
  }, []);

  if (progress <= 0) return null;

  return (
    <>
      {/* Soft backdrop tint that follows the finger */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[70] bg-foreground/20 backdrop-blur-[2px]"
        style={{ opacity: progress * 0.6, transition: "none" }}
      />
      {/* Edge pill that grows/fades with drag progress */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-1/2 -translate-y-1/2 z-[71] w-1.5 rounded-r-full bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.6)]"
        style={{
          height: `${64 + progress * 32}px`,
          opacity: 0.35 + progress * 0.65,
          transform: `translateY(-50%) translateX(${progress * 4}px)`,
          transition: "none",
        }}
      />
    </>
  );
}