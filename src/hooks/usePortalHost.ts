import { useEffect, useState } from "react";
import {
  ROTATION_FRAME_EVENT,
  notifyPortalHostChanged,
  resolveReaderPortalHost,
} from "@/lib/rotationFrame";

/**
 * Portal host for floating reader UI (autoscroll FAB, page pill).
 *
 * Why: elements portalled into <body> are NOT rendered while another element
 * (the reader shell) is in browser fullscreen — the top layer only paints the
 * fullscreen element's subtree. And in pseudo-landscape the reader rotates a
 * frame element; portals must land inside that frame or the FAB/pill stay
 * upright while the page lies sideways.
 */
export function usePortalHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(() => resolveReaderPortalHost());

  useEffect(() => {
    const sync = () => setHost(resolveReaderPortalHost());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    window.addEventListener(ROTATION_FRAME_EVENT, sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      window.removeEventListener(ROTATION_FRAME_EVENT, sync);
    };
  }, []);

  return host;
}

export { notifyPortalHostChanged };
export default usePortalHost;
