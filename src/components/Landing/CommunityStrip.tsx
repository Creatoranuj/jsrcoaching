import { memo } from "react";

/**
 * Legacy community strip — no longer rendered on the homepage.
 * Kept as a no-op export for backward compatibility with any admin toggle that
 * might still import it. Telegram links have been removed from the landing.
 */
const CommunityStrip = memo(() => null);

CommunityStrip.displayName = "CommunityStrip";
export default CommunityStrip;
