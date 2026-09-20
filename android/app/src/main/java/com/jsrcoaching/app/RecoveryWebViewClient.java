package com.jsrcoaching.app;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;

import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Fixes the "app goes blank/white after switching to another app and coming
 * back" bug on Android.
 *
 * Root cause: while the app is backgrounded, Android can kill the WebView's
 * *renderer* process to reclaim memory (very common on 3–4 GB devices with a
 * heavy PDF/video app in the background). The Activity survives, so the user
 * returns to a live window whose WebView has no content and no JS — every
 * JS-side watchdog (useResumeRecovery) is gone with the renderer, so nothing
 * can recover it. Without overriding onRenderProcessGone the default platform
 * behaviour is to kill the whole app process (or show a blank view).
 *
 * Recovery: detach + destroy the dead WebView and relaunch MainActivity, which
 * rebuilds the bridge and reloads the app from the packaged assets. The user
 * sees a brief splash instead of a permanently blank screen — the same
 * behaviour the big education apps ship.
 */
public class RecoveryWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "RecoveryWebView";

    /**
     * Payment / UPI deep-link schemes the WebView must hand to an installed
     * app instead of trying to load itself.
     *
     * Why this exists: Razorpay's checkout renders its UPI app tiles
     * (GPay / PhonePe / Paytm / BHIM) as `upi:`, `intent://` or vendor-scheme
     * links. A plain WebView cannot load a non-http scheme, so without this
     * override it fails silently with ERR_UNKNOWN_URL_SCHEME — which is
     * exactly the reported "browser UPI option kuch nahi karta" bug. The
     * matching `<queries>` block in AndroidManifest.xml lets Android 11+
     * actually resolve these packages.
     */
    private static final Set<String> EXTERNAL_SCHEMES = new HashSet<>(Arrays.asList(
        "upi", "intent", "phonepe", "tez", "gpay", "paytmmp", "paytm",
        "bhim", "credpay", "mailto", "tel", "sms", "whatsapp", "market"
    ));

    private final Activity activity;

    public RecoveryWebViewClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request != null ? request.getUrl() : null;
        String scheme = uri != null && uri.getScheme() != null
            ? uri.getScheme().toLowerCase(Locale.ROOT)
            : "";

        // http/https stays inside Capacitor's own navigation rules
        // (capacitor.config.ts → server.allowNavigation).
        if (scheme.isEmpty() || "http".equals(scheme) || "https".equals(scheme)
            || "file".equals(scheme) || "content".equals(scheme)
            || "capacitor".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme)) {
            return super.shouldOverrideUrlLoading(view, request);
        }

        if (!EXTERNAL_SCHEMES.contains(scheme)) {
            // Unknown non-http scheme: swallow it rather than letting the
            // WebView render an ERR_UNKNOWN_URL_SCHEME error page.
            Log.w(TAG, "blocked unknown scheme: " + scheme);
            return true;
        }

        return launchExternal(view, uri.toString(), scheme);
    }

    private boolean launchExternal(WebView view, String url, String scheme) {
        Intent intent;
        String fallbackUrl = null;
        try {
            if ("intent".equals(scheme)) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                fallbackUrl = intent.getStringExtra("browser_fallback_url");
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
            }
        } catch (URISyntaxException e) {
            Log.w(TAG, "unparseable external url", e);
            return true;
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
            return true;
        } catch (ActivityNotFoundException notFound) {
            Log.w(TAG, "no app for scheme " + scheme, notFound);
        }

        if (fallbackUrl != null && view != null) {
            view.loadUrl(fallbackUrl);
            return true;
        }

        try {
            Toast.makeText(
                activity,
                "Koi UPI app nahi mili. Kripya doosra payment method chunein.",
                Toast.LENGTH_LONG
            ).show();
        } catch (Exception ignored) {
            /* activity may be finishing */
        }
        return true;
    }

    @Override
    @TargetApi(Build.VERSION_CODES.O)
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        boolean crashed = detail != null && detail.didCrash();
        Log.w(TAG, "WebView render process gone (didCrash=" + crashed + ") — restarting activity");

        try {
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) {
                parent.removeView(view);
            }
            view.destroy();
        } catch (Exception e) {
            Log.w(TAG, "failed to tear down dead WebView", e);
        }

        try {
            Intent intent = new Intent(activity, MainActivity.class);
            intent.addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TASK
            );
            activity.startActivity(intent);
            activity.finish();
        } catch (Exception e) {
            Log.e(TAG, "failed to restart activity after renderer death", e);
        }

        // true = we handled it; do NOT let the platform kill the app process.
        return true;
    }
}
