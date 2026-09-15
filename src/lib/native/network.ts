/**
 * Bridge wrapper around @capacitor/network. Keeps direct `@capacitor/*`
 * imports out of hooks (enforced by ESLint `no-restricted-imports`) and
 * gives us one place to swap the impl or add breadcrumbs.
 *
 * Web fallback: `navigator.onLine` + `window` online/offline events.
 */
import { Capacitor } from "@capacitor/core";

export type NetStatus = { connected: boolean };
export type Unsubscribe = () => void;

export async function getNetworkStatus(): Promise<NetStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      return { connected: s.connected };
    } catch {
      /* fall through to web */
    }
  }
  return { connected: typeof navigator !== "undefined" ? navigator.onLine : true };
}

export async function onNetworkChange(
  cb: (s: NetStatus) => void
): Promise<Unsubscribe> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Network } = await import("@capacitor/network");
      const h = await Network.addListener("networkStatusChange", (st) =>
        cb({ connected: st.connected })
      );
      return () => {
        try { h.remove(); } catch { /* noop */ }
      };
    } catch {
      /* fall through */
    }
  }
  const upd = () => cb({ connected: navigator.onLine });
  window.addEventListener("online", upd);
  window.addEventListener("offline", upd);
  return () => {
    window.removeEventListener("online", upd);
    window.removeEventListener("offline", upd);
  };
}
