/**
 * Thin wrapper around @capacitor/haptics that no-ops on web and never throws.
 * Use for instant tactile feedback on primary tap actions (quiz submit,
 * navigation, toggles) to make the UI feel sub-100ms responsive.
 */
import { Capacitor } from "@capacitor/core";

type Style = "light" | "medium" | "heavy";

export async function tapHaptic(style: Style = "light"): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: map[style] });
  } catch {
    /* swallow — haptics are best-effort */
  }
}

export async function selectionHaptic(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  } catch {
    /* noop */
  }
}
