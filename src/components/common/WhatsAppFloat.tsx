import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_NUMBER } from "./WhatsAppButton";

interface WhatsAppFloatProps {
  /** Prefilled chat text */
  message?: string;
  /** When true, bumps up above sticky mobile CTA (~64-72px bar). */
  liftOnMobile?: boolean;
  /** Hide entirely on mobile — used when a sticky bottom CTA already occupies the safe zone. */
  hideOnMobile?: boolean;
}

/**
 * Floating WhatsApp FAB — fixed bottom-right on public pages.
 * Pulses on mount for 3s to draw the eye, then settles. Respects
 * reduced-motion. Sits above the sticky mobile CTA when liftOnMobile.
 */
const WhatsAppFloat = ({
  message = "Namaste! Mujhe JSR COACHING ke courses ke baare mein jaankari chahiye.",
  liftOnMobile = true,
  hideOnMobile = false,
}: WhatsAppFloatProps) => {
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  // Sits ABOVE the Sarthi chat FAB (which lives at bottom:5rem + safe-area,
  // height 3.5rem). We add ~1rem gap so both buttons are tappable without overlap.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="WhatsApp par baat karein"
      aria-label="Chat on WhatsApp"
      style={{
        bottom: liftOnMobile
          ? "calc(9.5rem + env(safe-area-inset-bottom, 0px))"
          : "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
      }}
      className={[
        "fixed right-4 md:right-6 z-40",
        hideOnMobile ? "hidden md:flex" : "flex",
        "h-14 w-14 rounded-full bg-whatsapp text-white shadow-lg shadow-whatsapp/30",
        "items-center justify-center",
        "hover:scale-105 active:scale-95 transition-transform duration-200",
        "motion-reduce:transition-none",
      ].join(" ")}
    >

      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-whatsapp opacity-60 animate-ping motion-reduce:hidden"
        />
      )}
      <WhatsAppIcon size={26} className="relative" />
    </a>
  );
};

export default WhatsAppFloat;
