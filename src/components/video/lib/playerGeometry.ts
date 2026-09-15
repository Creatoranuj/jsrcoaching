/**
 * Pure helpers extracted from MahimaGhostPlayer.
 *
 * These were inline closures inside the 1.7k-line player component, which made
 * them impossible to unit-test. Behaviour is byte-for-byte the same — only the
 * location changed.
 */

/** `123` -> `2:03`, `3725` -> `1:02:05`. Never throws on NaN/Infinity. */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0)
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** YouTube live URLs use the `/live/` path segment. */
export function isLiveStreamUrl(videoUrl?: string): boolean {
  return /\/live\//.test(videoUrl || "");
}

/** Privacy-preserving nocookie embed URL with all chrome disabled. */
export function buildYoutubeEmbedUrl(
  youtubeId: string,
  opts: { origin: string; isLive?: boolean },
): string {
  return (
    `https://www.youtube-nocookie.com/embed/${youtubeId}?` +
    new URLSearchParams({
      controls: "0",
      modestbranding: "1",
      rel: "0",
      showinfo: "0",
      iv_load_policy: "3",
      disablekb: "1",
      fs: "0",
      cc_load_policy: "0",
      playsinline: "1",
      autoplay: "1",
      mute: "1",
      enablejsapi: "1",
      origin: opts.origin,
      widget_referrer: opts.origin,
      start: "0",
      annotation: "0",
      autohide: "1",
      host: opts.origin,
      ...(opts.isLive ? { live: "1" } : {}),
    }).toString()
  );
}

export interface PointerRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * Maps a pointer position on the seek bar to a 0..1 ratio, accounting for the
 * CSS rotation applied in pseudo-fullscreen (0 / 90 / 180 / 270 degrees).
 */
export function pointerRatio(
  rect: PointerRect,
  clientX: number,
  clientY: number,
  rotation: number,
): { ratio: number; localX: number } {
  const r = ((rotation % 360) + 360) % 360;
  let ratio = 0;
  let localLen = rect.width;
  if (r === 90) {
    ratio = (clientY - rect.top) / rect.height;
    localLen = rect.height;
  } else if (r === 270) {
    ratio = (rect.bottom - clientY) / rect.height;
    localLen = rect.height;
  } else if (r === 180) {
    ratio = (rect.right - clientX) / rect.width;
  } else {
    ratio = (clientX - rect.left) / rect.width;
  }
  ratio = Math.max(0, Math.min(1, ratio));
  return { ratio, localX: ratio * localLen };
}

/** Progress/buffer bar width in percent; 0 when duration is unknown. */
export function percentOf(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}
