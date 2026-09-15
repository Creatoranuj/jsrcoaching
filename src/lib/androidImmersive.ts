/**
 * Toggle Android immersive mode (hide status bar + nav bar) while a video
 * is in fullscreen. Safe no-op on web / iOS — the bridge is only injected
 * by our Android wrapper (see MainActivity.java → ImmersiveBridge).
 */
type Bridge = { enter: () => void; exit: () => void };

const getBridge = (): Bridge | null => {
  if (typeof window === "undefined") return null;
  return (window as unknown as { AndroidImmersive?: Bridge }).AndroidImmersive ?? null;
};

export const enterImmersive = () => {
  try { getBridge()?.enter(); } catch { /* no-op */ }
};

export const exitImmersive = () => {
  try { getBridge()?.exit(); } catch { /* no-op */ }
};

let installed = false;
export const installImmersiveAutoToggle = () => {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const onChange = () => {
    if (document.fullscreenElement) enterImmersive();
    else exitImmersive();
  };
  document.addEventListener("fullscreenchange", onChange);
  // Our Mahima player toggles a CSS class for fake fullscreen
  const obs = new MutationObserver(() => {
    const isFake = document.querySelector(".mahima-fake-fullscreen");
    if (isFake) enterImmersive();
    else if (!document.fullscreenElement) exitImmersive();
  });
  obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
};
