import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogIn } from "lucide-react";
import { selectionHaptic, tapHaptic } from "@/lib/native/haptics";

/**
 * Conversion-focused sticky bar for mobile only (unauthenticated users).
 * - Left: Login (returning users)
 * - Right: Sign up free → primary CTA
 * WhatsApp counsellor is available via the floating FAB, so this bar
 * is dedicated to the highest-value action: getting the user into an account.
 * Hides once the footer scrolls into view to avoid double-CTA overlap.
 */
const StickyMobileCTA = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={[
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "bg-background/95 backdrop-blur border-t border-border",
        "px-3 py-2.5 flex items-center gap-2",
        "transition-transform duration-200",
        visible ? "translate-y-0" : "translate-y-full",
      ].join(" ")}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      <Link
        to="/login"
        onClick={() => { void selectionHaptic(); }}
        className="flex-1 h-11 rounded-md border border-primary/40 bg-primary/5 text-primary text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform duration-150 ease-out"
      >
        <LogIn className="h-4 w-4" /> Login
      </Link>
      <Link
        to="/signup"
        onClick={() => { void tapHaptic("light"); }}
        className="flex-[1.2] h-11 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform duration-150 ease-out shadow-md shadow-primary/25"
      >
        Sign up free <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
};

export default StickyMobileCTA;
