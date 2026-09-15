/**
 * Tiny global flag toggled by LessonView / PdfViewer when a media-heavy
 * surface is mounted. The personal library queue checks this and pauses
 * heavy file IO so the video player or lesson PDF never stutters.
 */
let count = 0;
const listeners = new Set<(busy: boolean) => void>();

function emit() {
  const busy = count > 0;
  listeners.forEach((l) => l(busy));
}

export function pushPlayerBusy(): () => void {
  count++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    emit();
  };
}

export function isPlayerBusy(): boolean {
  return count > 0;
}

export function onPlayerBusyChange(cb: (busy: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Resolve when no player is busy (polls every 200ms, max waits 30s). */
export function waitForPlayerIdle(timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    if (!isPlayerBusy()) return resolve();
    const start = Date.now();
    const tick = () => {
      if (!isPlayerBusy() || Date.now() - start > timeoutMs) return resolve();
      setTimeout(tick, 200);
    };
    tick();
  });
}
