import { useCallback, useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { openExternal } from "../../lib/native/browser";
import { tapHaptic } from "../../lib/native/haptics";
import { cn } from "../../lib/utils";
import { FAB_Z, fabBottom, fabBottomDesktop, type FabSlot } from "../../config/fabStack";

export interface WhatsAppFabProps {
  /** Number in wa.me form (digits only, country code first). */
  phone: string;
  /** Prefilled chat text. */
  message?: string;
  /**
   * Slot in the shared FAB stack. `base` is the lowest slot (used by the JSR
   * Agent chat bubble); WhatsApp sits one slot above it so the two 56px
   * buttons can never overlap. See `src/config/fabStack.ts`.
   */
  slot?: FabSlot;
  /** Escape hatch: explicit rem offset that overrides the slot. */
  bottomRem?: number;
  /** Pulse once on mount to draw the eye (respects reduced motion). */
  pulseOnMount?: boolean;
  className?: string;
  label?: string;
}

/**
 * Single floating WhatsApp action used across the app.
 *
 * Capacitor notes:
 * - `target="_blank"` inside the Android WebView can land on a dead blank
 *   tab; on native we hand the URL to the system browser / WhatsApp app via
 *   `openExternal`, which resolves the `wa.me` redirect into the installed app.
 * - `hover:` is gated behind `[@media(hover:hover)]` so the scale never
 *   sticks after a tap on touch devices.
 * - Tap target is 56px (>44px) and the offset always adds
 *   `env(safe-area-inset-bottom)` so the gesture bar never covers it.
 */
export default function WhatsAppFab({
  phone,
  message,
  slot = "raised",
  bottomRem,
  pulseOnMount = true,
  className,
  label = "WhatsApp par baat karein",
}: WhatsAppFabProps) {
  const [pulse, setPulse] = useState(pulseOnMount);

  useEffect(() => {
    if (!pulseOnMount) return;
    const t = setTimeout(() => setPulse(false), 3000);
    return () => clearTimeout(t);
  }, [pulseOnMount]);

  const href = `https://wa.me/${phone}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      setPulse(false);
      void tapHaptic("light");
      // Let plain web builds use the normal anchor behaviour.
      const isNative =
        typeof window !== "undefined" &&
        Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
      if (!isNative) return;
      e.preventDefault();
      void openExternal(href, { preferWebView: false }).catch((err) => {
        console.warn("[WhatsAppFab] openExternal failed", err);
        window.open(href, "_blank", "noopener");
      });
    },
    [href],
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      data-fab-slot={slot}
      title={label}
      onClick={onClick}
      style={{
        bottom: fabBottom(bottomRem ?? slot),
        zIndex: FAB_Z,
        ["--fab-md-bottom" as string]: fabBottomDesktop(slot),
      } as React.CSSProperties}
      className={cn(
        "fixed right-4 grid size-14 place-items-center rounded-full",
        "md:right-6 md:!bottom-[var(--fab-md-bottom)]",
        "bg-whatsapp text-whatsapp-foreground shadow-lg shadow-whatsapp/30",
        "transition-transform duration-200 active:scale-95",
        "[@media(hover:hover)]:hover:scale-105",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "motion-reduce:transition-none motion-reduce:transform-none",
        className,
      )}
    >
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-whatsapp opacity-60 animate-ping motion-reduce:hidden"
        />
      )}
      <WhatsAppIcon className="relative size-7" size={28} />
    </a>
  );
}
