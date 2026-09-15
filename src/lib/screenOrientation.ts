/**
 * Native-first orientation lock helper.
 *
 * On Capacitor (Android/iOS) it asks the OS to physically rotate the device —
 * no CSS transforms on the video iframe (which was causing freezes/lag on
 * Android WebView when toggling landscape in the player).
 *
 * On the web it falls back to the standard Screen Orientation API, then to
 * a no-op (the player still has its CSS-rotation pseudo-fullscreen as a
 * last-resort fallback).
 */

type Mode = "landscape" | "portrait";

const isNativePlatform = (): boolean => {
  try {
    return (globalThis as typeof globalThis & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

// IMPORTANT: Capacitor plugin proxies expose a `then` method. If we resolve
// a Promise with the bare proxy, the runtime treats it as a thenable and
// invokes `ScreenOrientation.then(...)` natively — which throws
// "not implemented on android" because no such bridge method exists.
// Wrap the proxy in a plain object so the Promise chain hands it back
// untouched.
let nativePluginPromise: Promise<{ plugin: any } | null> | null = null;
function loadWrapped(): Promise<{ plugin: any } | null> {
  if (!isNativePlatform()) return Promise.resolve(null);
  if (!nativePluginPromise) {
    nativePluginPromise = import("@capacitor/screen-orientation")
      .then((m) => ({ plugin: m.ScreenOrientation }))
      .catch(() => null);
  }
  return nativePluginPromise;
}

// CRITICAL: Never resolve a Promise with the bare Capacitor plugin proxy.
// The proxy has a `.then` trap; Promise resolution will invoke it natively
// → "ScreenOrientation.then() is not implemented on android". Always keep
// it inside the `{ plugin }` wrapper and call methods through that.

export async function lockOrientation(mode: Mode): Promise<boolean> {
  try {
    const wrapped = await loadWrapped();
    const native = wrapped?.plugin;
    if (native && typeof native.lock === "function") {
      await native.lock({ orientation: mode });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const so: any = (screen as any).orientation;
    if (so?.lock) {
      await so.lock(mode);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function unlockOrientation(): Promise<void> {
  try {
    const wrapped = await loadWrapped();
    const native = wrapped?.plugin;
    if (native && typeof native.unlock === "function") {
      await native.unlock();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    const so: any = (screen as any).orientation;
    if (so?.unlock) so.unlock();
  } catch {
    /* ignore */
  }
}

export const isNativeOrientationAvailable = () => isNativePlatform();
