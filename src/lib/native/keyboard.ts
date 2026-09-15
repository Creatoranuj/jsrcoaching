/**
 * Capacitor Keyboard inset publisher.
 *
 * Sets `--nb-keyboard-h` on <html> while the soft keyboard is on-screen so the
 * app can lift fixed footers / inputs above it via:
 *   padding-bottom: max(env(safe-area-inset-bottom), var(--nb-keyboard-h, 0px))
 *
 * No-op on web (and on platforms where the plugin isn't installed) so it's
 * safe to call unconditionally from main.tsx.
 */
let installed = false;

export async function installKeyboardInsetTracker(): Promise<void> {
  // Idempotency guard: HMR / StrictMode / accidental second-call must not
  // stack 4× Keyboard.addListener registrations (mirrors crashShield pattern).
  if (installed) return;
  installed = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    // Lazy-load the plugin so web bundles don't pay for it.
    const mod = await import("@capacitor/keyboard").catch(() => null);
    const Keyboard = mod?.Keyboard;
    if (!Keyboard) return;

    const setVar = (px: number) =>
      document.documentElement.style.setProperty("--nb-keyboard-h", `${Math.round(px)}px`);

    Keyboard.addListener("keyboardWillShow", (info) => {
      setVar(info.keyboardHeight ?? 0);
      // No manual scrollIntoView — `resize: 'native'` (capacitor.config.ts)
      // shrinks the WebView and the browser scrolls the focused input into
      // view natively. A manual scroll fires one frame later and causes a
      // visible double-scroll jump on iOS. See brief 04-14-15 rule 5.
    });
    Keyboard.addListener("keyboardDidShow",  (info) => setVar(info.keyboardHeight ?? 0));
    Keyboard.addListener("keyboardWillHide", () => setVar(0));
    Keyboard.addListener("keyboardDidHide",  () => setVar(0));

    // iOS: hide the grey "Done" accessory toolbar above the keyboard for a
    // cleaner chat/composer surface. No-op on Android.
    try { await Keyboard.setAccessoryBarVisible({ isVisible: false }); } catch {}

    // Bind keyboard chrome to app theme by observing the `.dark` class on
    // <html> (owned by ThemeContext). Keeps this bridge React-free.
    const applyStyle = async () => {
      const isDark = document.documentElement.classList.contains("dark");
      try {
        const { KeyboardStyle } = await import("@capacitor/keyboard");
        await Keyboard.setStyle({ style: isDark ? KeyboardStyle.Dark : KeyboardStyle.Light });
      } catch { /* noop */ }
    };
    applyStyle();
    new MutationObserver(applyStyle).observe(document.documentElement, {
      attributes: true, attributeFilter: ["class"],
    });

    // Runtime setResizeMode is intentionally not called: in Capacitor 7 it is
    // iOS-only and Android logs UNIMPLEMENTED. Native resize is configured in
    // capacitor.config.ts via plugins.Keyboard.resize.
  } catch {
    // Plugin not installed or failed to load — silently no-op.
  }
}

/**
 * Best-effort keyboard dismiss for the back-button priority stack (step 0).
 * Silent no-op on web / when the plugin isn't available.
 */
export async function hideKeyboard(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const mod = await import("@capacitor/keyboard").catch(() => null);
    await mod?.Keyboard?.hide();
  } catch { /* noop */ }
}



