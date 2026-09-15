import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Web-side "blank on capture" shield for students.
 *
 * Complements the native Android FLAG_SECURE path (see `useScreenProtection`).
 * On web browsers FLAG_SECURE has no equivalent — the OS captures pixels
 * outside the page. This hook is a best-effort layer that:
 *
 *  - Renders a full-viewport black overlay whenever the tab loses focus,
 *    goes hidden, or the user presses a common screenshot / print shortcut.
 *  - Suppresses context menu / copy / drag on the surface it protects.
 *  - Auto-clears the overlay a moment after focus returns.
 *
 * ADMIN BYPASS: mirrors `useScreenProtection` — admins are never affected.
 * Fail-safe: while role is unresolved, treat as student (shield ON).
 *
 * HONEST LIMITS: A phone-camera photo or an OS screenshot fired while the
 * tab is still active WILL succeed. Only the native APK path gives a real
 * guarantee. Use this together with `useScreenProtection(true)`.
 */

const OVERLAY_ID = "nb-screenshot-shield-overlay";
let refCount = 0;
let hideTimer: number | null = null;

function ensureOverlay(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100dvh",
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
    "background:#000",
    "z-index:2147483646",
    "display:none",
    "pointer-events:none",
    "transition:opacity 120ms linear",
    "opacity:0",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

function showOverlay() {
  const el = ensureOverlay();
  if (!el) return;
  if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  el.style.display = "block";
  // force reflow so opacity transition applies
  void el.offsetHeight;
  el.style.opacity = "1";
}

function hideOverlaySoon() {
  const el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!el) return;
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    el.style.opacity = "0";
    window.setTimeout(() => { if (el) el.style.display = "none"; }, 140);
    hideTimer = null;
  }, 800);
}

function isScreenshotKey(e: KeyboardEvent): boolean {
  if (e.key === "PrintScreen") return true;
  // macOS: Cmd+Shift+3/4/5
  if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) return true;
  // Ctrl+P (print → often used to save PDF of screen)
  if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) return true;
  return false;
}

function onKeyDown(e: KeyboardEvent) {
  if (!isScreenshotKey(e)) return;
  e.preventDefault();
  showOverlay();
  try { navigator.clipboard?.writeText?.(""); } catch { /* noop */ }
  hideOverlaySoon();
}

function onVisibility() {
  if (document.visibilityState === "hidden") showOverlay();
  else hideOverlaySoon();
}
function onBlur() { showOverlay(); }
function onFocus() { hideOverlaySoon(); }
function onPageHide() { showOverlay(); }
function preventSurface(e: Event) {
  // Only block within the protected root
  const target = e.target as HTMLElement | null;
  if (target?.closest?.("[data-lesson-root]")) e.preventDefault();
}

function attach() {
  refCount += 1;
  if (refCount > 1) return;
  try {
    ensureOverlay();
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("contextmenu", preventSurface, true);
    document.addEventListener("copy", preventSurface, true);
    document.addEventListener("dragstart", preventSurface, true);
    document.body.classList.add("nb-screenshot-shield-active");
  } catch { /* noop */ }
}

function detach() {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  try {
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("contextmenu", preventSurface, true);
    document.removeEventListener("copy", preventSurface, true);
    document.removeEventListener("dragstart", preventSurface, true);
    document.body.classList.remove("nb-screenshot-shield-active");
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  } catch { /* noop */ }
}

export function useWebScreenshotShield(active: boolean = true): void {
  const { isAdmin, roleLoaded } = useAuth();
  // Fail-safe: while role is unresolved, act as student (shield ON).
  const shouldShield = active && !(roleLoaded && isAdmin);

  useEffect(() => {
    if (!shouldShield) return;
    attach();
    return () => { detach(); };
  }, [shouldShield]);
}
