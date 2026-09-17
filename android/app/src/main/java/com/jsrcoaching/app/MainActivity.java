package com.jsrcoaching.app;

import com.getcapacitor.BridgeActivity;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.razorpay.ExternalWalletListener;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;
import org.json.JSONObject;

/**
 * Implements Razorpay's PaymentResultWithDataListener + ExternalWalletListener
 * ON PURPOSE. With standard-core 1.7.x `Checkout` is a Fragment that starts
 * CheckoutActivity itself and reports the outcome to the HOST ACTIVITY via
 * these interfaces — the host's onActivityResult never sees RZP_REQUEST_CODE.
 * Without these methods the payment result vanished and the WebView stayed on
 * "Opening payment…" forever. Do NOT also implement PaymentResultListener: the
 * SDK prefers it and it carries no order id / signature.
 */
public class MainActivity extends BridgeActivity
        implements PaymentResultWithDataListener, ExternalWalletListener {
    /** Pending callback for an in-flight `<input type="file">` picker. */
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 51426;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own Razorpay bridge (RazorpayNativePlugin) replaces the abandoned
        // `capacitor-razorpay` package, which opened CheckoutActivity through a
        // raw Intent and therefore never showed UPI app tiles. Capacitor requires
        // registerPlugin() to run BEFORE super.onCreate().
        registerPlugin(RazorpayNativePlugin.class);
        // Reports why the process died last time (low memory / native crash /
        // ANR) so triage no longer needs `adb logcat` on a cabled device.
        registerPlugin(AppExitInfoPlugin.class);
        super.onCreate(savedInstanceState);

        // Warm up Razorpay so the payment-method list (including installed UPI
        // apps) is resolved before the user taps Buy.
        RazorpayNativePlugin.preload(getApplicationContext());



        // Hook the WebView's WebChromeClient so we can react to HTML5
        // Element.requestFullscreen() (used by our video players) and
        // toggle Android immersive mode — hides the top status bar and
        // bottom navigation bar while a video is fullscreen.
        com.getcapacitor.Bridge b = getBridge();
        if (b != null && b.getWebView() != null) {
            b.getWebView().setWebChromeClient(new BridgeFullscreenWebChromeClient(this));
            // Renderer-death recovery: if Android kills the WebView renderer
            // while the app is backgrounded, we rebuild the Activity instead of
            // leaving the user on a blank screen. See RecoveryWebViewClient.
            b.getWebView().setWebViewClient(new RecoveryWebViewClient(b, this));
            b.getWebView().addJavascriptInterface(new ImmersiveBridge(this), "AndroidImmersive");
        }
        handleSmokeLoginIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        // Some OEM skins (MIUI / ColorOS / Funtouch) leave the WebView's JS
        // timers paused after a long background stint, which freezes rAF and
        // setTimeout — the UI paints but never updates. Resuming explicitly is
        // cheap and idempotent.
        try {
            com.getcapacitor.Bridge bridge = getBridge();
            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {
            // best-effort
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSmokeLoginIntent(intent);
    }

    /**
     * Launches the native file picker for a WebView `<input type="file">`.
     * Returns true so the WebView waits for the async result delivered via
     * onActivityResult. Without this, tapping "Add PDF" does nothing.
     */
    boolean startFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        // Cancel any previous in-flight picker so we never leak a callback.
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;

        Intent intent;
        try {
            intent = params.createIntent();
        } catch (Exception e) {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            startActivityForResult(Intent.createChooser(intent, "Select file"), FILE_CHOOSER_REQUEST);
        } catch (Exception e) {
            filePathCallback = null;
            callback.onReceiveValue(null);
            return false;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        // Legacy Razorpay cores start CheckoutActivity from the host Activity,
        // so their result lands here. The current fragment-based core reports
        // through onPaymentSuccess/onPaymentError below instead; the plugin
        // settles each checkout exactly once whichever path fires.
        if (requestCode == com.razorpay.Checkout.RZP_REQUEST_CODE) {
            if (RazorpayNativePlugin.handleCheckoutResult(this, requestCode, resultCode, data)) {
                return;
            }
        }
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ---- Razorpay result handover (standard-core 1.7.x fragment flow) ----
    // The SDK toasts "method is throwing an error" and drops the result if a
    // listener throws, so every handler is fully guarded.

    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        try {
            RazorpayNativePlugin.deliverSuccess(razorpayPaymentId, paymentData);
        } catch (Throwable ignored) {
            // deliverSuccess already rejects the pending call on internal failure.
        }
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        try {
            RazorpayNativePlugin.deliverError(code, description, paymentData);
        } catch (Throwable ignored) {
            // never propagate into the SDK's callback dispatcher
        }
    }

    @Override
    public void onExternalWalletSelected(String walletName, PaymentData paymentData) {
        try {
            RazorpayNativePlugin.deliverExternalWallet(walletName);
        } catch (Throwable ignored) {
            // never propagate into the SDK's callback dispatcher
        }
    }





    void enterImmersive() {
        runOnUiThread(() -> {
            Window window = getWindow();
            if (window == null) return;
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                }
            } else {
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        });
    }

    void exitImmersive() {
        runOnUiThread(() -> {
            Window window = getWindow();
            if (window == null) return;
            // NOTE: do NOT call setDecorFitsSystemWindows(window, true) here.
            // Flipping it back to `true` collapses env(safe-area-inset-*) to 0
            // for the rest of the app session because the WebView is shrunk
            // to fit within system bars — headers using pt-safe-t / .safe-area-top
            // then lose their inset until the Activity is recreated. Keeping
            // edge-to-edge on (the Capacitor default set once in onCreate) and
            // only restoring bar visibility here preserves the insets.
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            } else {
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });
    }

    boolean isTrustedWebViewOrigin() {
        try {
            com.getcapacitor.Bridge b = getBridge();
            WebView webView = b != null ? b.getWebView() : null;
            String url = webView != null ? webView.getUrl() : null;
            return isTrustedOriginUrl(url);
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isTrustedOriginUrl(String url) {
        if (url == null) return false;
        return url.startsWith("https://localhost")
            || url.startsWith("capacitor://localhost")
            || url.startsWith("http://localhost")
            || url.startsWith("https://jsrcoaching.vercel.app")
            || url.startsWith("https://jsrcoaching.com")
            || url.startsWith("https://www.jsrcoaching.com")
            || url.startsWith("https://app.jsrcoaching.com");
    }

    private boolean isSmokeTestBuild() {
        try {
            ApplicationInfo info = getPackageManager().getApplicationInfo(
                getPackageName(),
                PackageManager.GET_META_DATA
            );
            if (info.metaData == null) return false;
            Object raw = info.metaData.get("com.sadguru.SMOKE_TEST_BUILD");
            return Boolean.TRUE.equals(raw) || "true".equals(String.valueOf(raw));
        } catch (Exception e) {
            return false;
        }
    }

    private void handleSmokeLoginIntent(Intent intent) {
        if (intent == null || !isSmokeTestBuild()) return;
        if (!intent.getBooleanExtra("safar_smoke_fill_login", false)) return;

        String email = decodeSmokeExtra(intent.getStringExtra("safar_smoke_email_b64"));
        String password = decodeSmokeExtra(intent.getStringExtra("safar_smoke_password_b64"));
        if (email == null || password == null) return;

        runOnUiThread(() -> {
            com.getcapacitor.Bridge b = getBridge();
            WebView webView = b != null ? b.getWebView() : null;
            if (webView == null || !isTrustedWebViewOrigin()) return;

            String script = "(() => {"
                + "const setValue=(selector,value)=>{"
                + "const el=document.querySelector(selector);"
                + "if(!el)return false;"
                + "const proto=Object.getPrototypeOf(el);"
                + "const desc=Object.getOwnPropertyDescriptor(proto,'value')||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');"
                + "if(desc&&desc.set){desc.set.call(el,value);}else{el.value=value;}"
                + "el.dispatchEvent(new Event('input',{bubbles:true}));"
                + "el.dispatchEvent(new Event('change',{bubbles:true}));"
                + "return el.value===value;"
                + "};"
                + "return JSON.stringify({email:setValue('#email'," + JSONObject.quote(email) + "),password:setValue('#password'," + JSONObject.quote(password) + ")});"
                + "})()";
            webView.evaluateJavascript(script, null);
        });
    }

    private String decodeSmokeExtra(String encoded) {
        if (encoded == null) return null;
        try {
            return new String(android.util.Base64.decode(encoded, android.util.Base64.DEFAULT), "UTF-8");
        } catch (Exception e) {
            return null;
        }
    }
}

class ImmersiveBridge {
    private final MainActivity activity;
    ImmersiveBridge(MainActivity activity) { this.activity = activity; }

    /**
     * S1 (security): Origin-gate the JS bridge so only first-party app HTML
     * (loaded from https://localhost via Capacitor's androidScheme, or a
     * trusted app origin) can toggle immersive mode. Without
     * this, any 3rd-party iframe/page ever loaded into the main WebView
     * could control device chrome.
     */
    @JavascriptInterface
    public void enter() {
        // @JavascriptInterface methods execute on Android's JavaBridge thread.
        // WebView APIs (including getUrl) must only be touched on the UI
        // thread, otherwise Android 15 logs repeated wrong-thread violations
        // and Maestro can lose first-paint visibility during smoke tests.
        activity.runOnUiThread(() -> {
            if (activity.isTrustedWebViewOrigin()) activity.enterImmersive();
        });
    }

    @JavascriptInterface
    public void exit() {
        activity.runOnUiThread(() -> {
            if (activity.isTrustedWebViewOrigin()) activity.exitImmersive();
        });
    }
}
