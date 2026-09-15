/**
 * Loads the YouTube IFrame Player API exactly once.
 * Returns the global `YT` namespace (typed loosely to avoid d.ts coupling).
 */
type YTGlobal = {
  Player: new (el: HTMLElement | string, opts: unknown) => unknown;
  PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
};

let promise: Promise<YTGlobal> | null = null;

export function loadYouTubeIframeAPI(): Promise<YTGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API requires window"));
  }
  const w = window as unknown as {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT && w.YT.Player) {
    return Promise.resolve(w.YT);
  }
  if (promise) return promise;

  promise = new Promise<YTGlobal>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT);
      else reject(new Error("YT global missing after API ready"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existing) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => reject(new Error("Failed to load YouTube IFrame API"));
    document.head.appendChild(tag);
  });

  return promise;
}
