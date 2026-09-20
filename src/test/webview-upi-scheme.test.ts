import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the Razorpay "UPI app tile does nothing" bug.
 *
 * Razorpay's checkout opens UPI apps through non-http schemes. A plain
 * WebView drops those with ERR_UNKNOWN_URL_SCHEME, so the Android client MUST
 * override shouldOverrideUrlLoading and hand them to an external Intent, and
 * the manifest MUST declare matching <queries> so Android 11+ can resolve the
 * packages. Both are easy to delete by accident during a Capacitor upgrade.
 */
const JAVA = resolve(
  __dirname,
  "../../android/app/src/main/java/com/jsrcoaching/app/RecoveryWebViewClient.java",
);
const MANIFEST = resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml");

describe("android UPI deep-link handling", () => {
  const java = readFileSync(JAVA, "utf8");
  const manifest = readFileSync(MANIFEST, "utf8");

  it("overrides url loading for non-http schemes", () => {
    expect(java).toMatch(/public boolean shouldOverrideUrlLoading\(/);
    expect(java).toContain("Intent.parseUri");
    expect(java).toContain("browser_fallback_url");
    expect(java).toContain("FLAG_ACTIVITY_NEW_TASK");
  });

  it("allow-lists the UPI payment schemes", () => {
    for (const scheme of ["upi", "intent", "phonepe", "tez", "gpay", "paytmmp", "bhim"]) {
      expect(java).toContain(`"${scheme}"`);
    }
  });

  it("keeps http/https inside the Capacitor navigation rules", () => {
    expect(java).toContain("super.shouldOverrideUrlLoading(view, request)");
  });

  it("declares UPI + browser package visibility in the manifest", () => {
    expect(manifest).toContain("<queries>");
    expect(manifest).toMatch(/android:scheme="upi"/);
    expect(manifest).toMatch(/android:scheme="https"/);
  });
});

describe("android UPI popup handling", () => {
  const chrome = readFileSync(
    resolve(__dirname, "../../android/app/src/main/java/com/jsrcoaching/app/BridgeFullscreenWebChromeClient.java"),
    "utf8",
  );
  const main = readFileSync(
    resolve(__dirname, "../../android/app/src/main/java/com/jsrcoaching/app/MainActivity.java"),
    "utf8",
  );
  const client = readFileSync(JAVA, "utf8");

  // Razorpay's UPI tiles use window.open(); those never reach
  // shouldOverrideUrlLoading, so without onCreateWindow the tap does nothing.
  it("routes window.open popups to the deep-link handler", () => {
    expect(chrome).toContain("onCreateWindow");
    expect(chrome).toContain("RecoveryWebViewClient.handlePopupUrl");
  });

  it("enables multiple windows so popups reach onCreateWindow", () => {
    expect(main).toContain("setSupportMultipleWindows(true)");
    expect(main).toContain("setJavaScriptCanOpenWindowsAutomatically(true)");
  });

  it("keeps the legacy url-loading overload for OEM WebViews", () => {
    expect(client).toContain("shouldOverrideUrlLoading(WebView view, String url)");
    expect(client).toContain("static boolean handlePopupUrl");
  });
});
