import { Suspense } from "react";
import AutoScrollFab from "./AutoScrollFab";
import PageIndicatorPill from "./PageIndicatorPill";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { readerDebugEnabled } from "../../lib/reader/readerDebugFlag";

/* Diagnostics surface: dev builds, or an explicitly opted-in session. Lazily
   imported so normal sessions never download it. */
const ReaderDebugPanel = lazyWithRetry(
  () => import("./ReaderDebugPanel"),
) as typeof import("./ReaderDebugPanel").default;

interface Props {
  /** Same-origin scroller (canvas reader). */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** pdf.js iframe surface. */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Vertical offset above the bottom edge for the FAB (px). */
  bottomOffset?: number;
  onActiveChange?: (active: boolean) => void;
  visible?: boolean;
  /** Keep the page chip on screen while the reader chrome is visible. */
  pinned?: boolean;
  docKey?: string;
  /** Soft-keyboard height, so the debug panel never hides behind it. */
  keyboardInset?: number;
}

/**
 * Single mount point for the reader overlays (autoscroll FAB + Drive-style
 * page pill). Every reader surface must render this instead of wiring the two
 * components up by hand — that duplication is why the pill went missing on the
 * main reader once before.
 */
export default function ReaderOverlays({
  targetRef,
  iframeRef,
  bottomOffset,
  onActiveChange,
  visible,
  pinned,
  docKey,
  keyboardInset = 0,
}: Props): JSX.Element {
  return (
    <>
      <AutoScrollFab
        targetRef={targetRef}
        iframeRef={iframeRef}
        bottomOffset={bottomOffset}
        onActiveChange={onActiveChange}
        visible={visible}
        docKey={docKey}
      />
      <PageIndicatorPill targetRef={targetRef} iframeRef={iframeRef} pinned={pinned} />
      {readerDebugEnabled() && (
        <Suspense fallback={null}>
          <ReaderDebugPanel keyboardInset={keyboardInset} />
        </Suspense>
      )}
    </>
  );
}
