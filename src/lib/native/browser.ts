/**
 * Open URLs inside the app on native.
 *
 * Important for Drive/Docs/Notion:
 * Their pages use redirects, CSP and app-specific JS that often render blank
 * inside our PDF iframe / embedded WebView surface. For those hosts, prefer
 * Capacitor InAppBrowser's system-browser mode (Android Custom Tabs / iOS
 * SafariVC): it is still an in-app overlay, but uses the platform browser
 * engine/cookies and survives Google/Notion redirects far more reliably.
 */
type OpenExternalOptions = {
  /** Force embedded WebView first. Defaults to false for redirect-heavy hosts. */
  preferWebView?: boolean;
};

const REDIRECT_HEAVY_HOST_RE = /(^|\.)(drive\.google\.com|docs\.google\.com|notion\.site|notion\.so|notion\.com)$/i;

export function isRedirectHeavyUrl(url: string): boolean {
  try {
    return REDIRECT_HEAVY_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const openExternal = async (url: string, options: OpenExternalOptions = {}): Promise<void> => {
  let isNative = false;
  try {
    const { Capacitor } = await import(/* @vite-ignore */ "@capacitor/core");
    isNative = Capacitor.isNativePlatform();
    if (isNative) {
      const shouldTryWebView = options.preferWebView ?? !isRedirectHeavyUrl(url);
      try {
        const {
          InAppBrowser,
          DefaultSystemBrowserOptions,
          DefaultAndroidSystemBrowserOptions,
          DefaultiOSSystemBrowserOptions,
          ToolbarPosition,
          iOSViewStyle,
          iOSAnimation,
          AndroidViewStyle,
          AndroidAnimation,
          DismissStyle,
        } = await import(/* @vite-ignore */ "@capacitor/inappbrowser");

        if (shouldTryWebView) {
          try {
            await InAppBrowser.openInWebView({
              url,
              options: {
                showURL: false,
                showToolbar: true,
                clearCache: false,
                clearSessionCache: false,
                mediaPlaybackRequiresUserAction: false,
                closeButtonText: "Close",
                toolbarPosition: ToolbarPosition.TOP,
                showNavigationButtons: true,
                leftToRight: false,
                customWebViewUserAgent: null,
                android: {
                  allowZoom: true,
                  hardwareBack: true,
                  pauseMedia: true,
                },
                iOS: {
                  allowOverScroll: true,
                  enableViewportScale: true,
                  allowInLineMediaPlayback: true,
                  surpressIncrementalRendering: false,
                  viewStyle: iOSViewStyle.FULL_SCREEN,
                  animationEffect: iOSAnimation.COVER_VERTICAL,
                  allowsBackForwardNavigationGestures: true,
                },
              },
            });
            return;
          } catch (err) {
            console.warn("[openExternal] InAppBrowser WebView unavailable, trying system browser", err);
          }
        }

        // Android Custom Tabs / iOS SafariVC: still opens over the app, not as
        // a separate browser task. This is the most reliable surface for
        // Google Drive, Google Docs and Notion pages.
        await InAppBrowser.openInSystemBrowser({
          url,
          options: {
            ...DefaultSystemBrowserOptions,
            android: {
              ...DefaultAndroidSystemBrowserOptions,
              showTitle: true,
              hideToolbarOnScroll: false,
              viewStyle: AndroidViewStyle.FULL_SCREEN,
              startAnimation: AndroidAnimation.FADE_IN,
              exitAnimation: AndroidAnimation.FADE_OUT,
            },
            iOS: {
              ...DefaultiOSSystemBrowserOptions,
              closeButtonText: DismissStyle.CLOSE,
              viewStyle: iOSViewStyle.FULL_SCREEN,
              animationEffect: iOSAnimation.COVER_VERTICAL,
              enableBarsCollapsing: false,
              enableReadersMode: false,
            },
          },
        });
        return;
      } catch (err) {
        console.warn("[openExternal] InAppBrowser unavailable, trying Browser", err);
      }

      // Fallback: still opens on top of the app (Android Custom Tabs /
      // SFSafariViewController), not via target=_system external handoff.
      try {
        const { Browser } = await import(/* @vite-ignore */ "@capacitor/browser");
        await Browser.open({ url, presentationStyle: "fullscreen" });
        return;
      } catch (err) {
        console.warn("[openExternal] Browser plugin unavailable", err);
      }

      throw new Error("No native in-app browser plugin is available");
    }
  } catch { /* fall through */ }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
};
