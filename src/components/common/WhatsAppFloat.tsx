import WhatsAppFab from "./WhatsAppFab";
import { WHATSAPP_NUMBER } from "./WhatsAppButton";

interface WhatsAppFloatProps {
  /** Prefilled chat text */
  message?: string;
  /** When true, bumps up above the sticky mobile CTA / auth bar. */
  liftOnMobile?: boolean;
  /** Hide entirely on mobile — used when a sticky bottom CTA already occupies the safe zone. */
  hideOnMobile?: boolean;
}

/**
 * Floating WhatsApp FAB for public pages.
 * Thin wrapper over the shared `WhatsAppFab` so every surface gets the same
 * native-open behaviour, haptics, safe-area offset and touch-safe hover.
 */
const WhatsAppFloat = ({
  message = "Namaste! Mujhe JSR COACHING ke courses ke baare mein jaankari chahiye.",
  liftOnMobile = true,
  hideOnMobile = false,
}: WhatsAppFloatProps) => (
  <WhatsAppFab
    phone={WHATSAPP_NUMBER}
    message={message}
    bottomRem={liftOnMobile ? 9.5 : 5.5}
    className={hideOnMobile ? "hidden md:grid" : undefined}
  />
);

export default WhatsAppFloat;
