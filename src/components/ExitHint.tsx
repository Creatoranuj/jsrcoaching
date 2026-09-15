import { useEffect, useState } from "react";

/**
 * Tiny bottom pill that appears for ~2s when the hardware back button is
 * pressed once on an EXIT route. Independent of sonner so it's always visible.
 *
 * Triggered by: window.dispatchEvent(new CustomEvent("nb:back-exit-hint"))
 */
export const ExitHint = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 2000);
    };
    window.addEventListener("nb:back-exit-hint", show);
    return () => {
      window.removeEventListener("nb:back-exit-hint", show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      className="fixed left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-foreground/90 px-4 py-2 text-sm font-medium text-background shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      role="status"
    >
      Press back again to exit
    </div>
  );
};

export default ExitHint;
