/**
 * Native share sheet wrapper. Falls back to navigator.share or clipboard
 * on web. All Capacitor imports are dynamic to keep the web bundle clean.
 */
type ShareInput = { title?: string; text?: string; url?: string; dialogTitle?: string };

export const shareContent = async (input: ShareInput): Promise<boolean> => {
  try {
    const { Capacitor } = await import(/* @vite-ignore */ "@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import(/* @vite-ignore */ "@capacitor/share");
      await Share.share(input);
      return true;
    }
  } catch { /* fall through */ }

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try { await (navigator as Navigator & { share: (d: ShareInput) => Promise<void> }).share(input); return true; }
    catch { /* user cancelled or unsupported */ }
  }
  if (input.url && typeof navigator !== "undefined" && navigator.clipboard) {
    try { await navigator.clipboard.writeText(input.url); return true; } catch { /* noop */ }
  }
  return false;
};
