/**
 * Centralised Capacitor platform detection.
 *
 * Use these helpers instead of importing `Capacitor` everywhere — keeps
 * mocking trivial in tests and makes web-vs-native branches grep-able.
 */
import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS = (): boolean => Capacitor.getPlatform() === "ios";
export const isAndroid = (): boolean => Capacitor.getPlatform() === "android";
export const isWeb = (): boolean => Capacitor.getPlatform() === "web";

/** Runs `fn` only on native platforms; returns undefined on web. */
export async function onlyNative<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
  if (!isNative()) return undefined;
  return await fn();
}
