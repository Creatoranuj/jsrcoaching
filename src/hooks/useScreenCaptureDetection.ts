import { useEffect, useState } from "react";
import { loadCore } from "@/lib/native/core";

/**
 * Detects active iOS screen recording via @capacitor-community/privacy-screen.
 *
 * Web / Android / plugin missing → returns `{ isCapturing: false }` forever.
 *
 * Listeners are registered ONCE at module scope (ref-counted) so multiple
 * hook instances or StrictMode double-mounts don't stack duplicate native
 * subscriptions on the same event name.
 */

const subscribers = new Set<(v: boolean) => void>();
let currentValue = false;
let setupPromise: Promise<void> | null = null;
let teardown: (() => void) | null = null;

function emit(v: boolean) {
  currentValue = v;
  subscribers.forEach((fn) => fn(v));
}

async function ensureListener(): Promise<void> {
  if (setupPromise || teardown) return setupPromise ?? undefined;
  setupPromise = (async () => {
    try {
      const { Capacitor } = await loadCore();
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
      const mod: any = await import(
        /* @vite-ignore */ "@capacitor-community/privacy-screen"
      ).catch(() => null);
      const plugin = mod?.PrivacyScreen;
      if (!plugin?.addListener) return;
      const startHandle = await plugin.addListener("screenRecordingStarted", () => emit(true));
      const stopHandle = await plugin.addListener("screenRecordingStopped", () => emit(false));
      teardown = () => {
        startHandle?.remove?.();
        stopHandle?.remove?.();
        teardown = null;
      };
    } catch {
      /* silent */
    }
  })();
  return setupPromise;
}

export function useScreenCaptureDetection(): { isCapturing: boolean } {
  const [isCapturing, setIsCapturing] = useState(currentValue);

  useEffect(() => {
    subscribers.add(setIsCapturing);
    void ensureListener();
    return () => {
      subscribers.delete(setIsCapturing);
      if (subscribers.size === 0 && teardown) {
        teardown();
      }
    };
  }, []);

  return { isCapturing };
}
