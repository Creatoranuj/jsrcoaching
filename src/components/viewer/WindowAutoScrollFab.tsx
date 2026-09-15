import AutoScrollFab from "./AutoScrollFab";
import { useScrollHost } from "@/hooks/useScrollHost";
import { recordReaderEvent } from "@/lib/perf/marks";
import { describeScrollHost } from "@/lib/reader/scrollHost";
import { useEffect } from "react";

/**
 * AutoScroll FAB variant that scrolls whichever element actually scrolls.
 *
 * Previously this hard-assumed `document.scrollingElement`. In the reader the
 * scrolling happens inside an inner container, so the FAB bound to a dead
 * element and pause/resume never fired. `useScrollHost` resolves the real
 * host and re-resolves on resize / rotation / late-mounting containers.
 *
 * Guarded: if nothing on the page scrolls, the FAB is hidden so it doesn't
 * read as "dead" to the user.
 */
export default function WindowAutoScrollFab(
  props: Omit<React.ComponentProps<typeof AutoScrollFab>, "targetRef" | "iframeRef">
) {
  const { hostRef, host, scrollable } = useScrollHost();

  useEffect(() => {
    if (host) recordReaderEvent("host", { host: describeScrollHost(host) });
  }, [host]);

  if (!scrollable) return null;
  return <AutoScrollFab targetRef={hostRef} {...props} />;
}
