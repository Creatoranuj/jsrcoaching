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
        if (uri == null) {
            return super.shouldOverrideUrlLoading(view, request);
        }
        String scheme = schemeOf(uri.toString());
        if (isInternalScheme(scheme)) {
            return super.shouldOverrideUrlLoading(view, request);
        }
        return routeExternal(view, uri.toString(), scheme);
    }

    /**
     * Legacy overload. Some OEM WebView builds (and sub-frame navigations)
     * still call this one — without it those `upi:` / `intent://` taps fall
     * through to the default handler and die with ERR_UNKNOWN_URL_SCHEME.
     */
    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        String scheme = schemeOf(url);
        if (isInternalScheme(scheme)) {
            return super.shouldOverrideUrlLoading(view, url);
        }
        return routeExternal(view, url, scheme);
    }

    private boolean routeExternal(WebView view, String url, String scheme) {
        if (!EXTERNAL_SCHEMES.contains(scheme)) {
            // Unknown non-http scheme: swallow it rather than letting the
            // WebView render an ERR_UNKNOWN_URL_SCHEME error page.
            Log.w(TAG, "blocked unknown scheme: " + scheme);
            return true;
        }
        return launchExternal(activity, view, url, scheme);
    }

    static String schemeOf(String url) {
        try {
            String s = Uri.parse(url).getScheme();
            return s == null ? "" : s.toLowerCase(Locale.ROOT);
        } catch (Exception e) {
            return "";
        }
    }

    /** http/https stays inside Capacitor's own navigation rules. */
    static boolean isInternalScheme(String scheme) {
        return scheme.isEmpty() || "http".equals(scheme) || "https".equals(scheme)
            || "file".equals(scheme) || "content".equals(scheme)
            || "capacitor".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme);
    }

    /**
     * Entry point for popup navigations (`window.open` / `target="_blank"`),
     * which never reach shouldOverrideUrlLoading. Razorpay's checkout opens
     * several UPI tiles that way, so before this route the tap did nothing at
     * all. Returns true when the URL was consumed as an external deep link.
     */
    static boolean handlePopupUrl(Activity activity, WebView view, String url) {
        String scheme = schemeOf(url);
        if (isInternalScheme(scheme) || !EXTERNAL_SCHEMES.contains(scheme)) {
            return false;
        }
        Log.i(TAG, "deeplink via popup scheme=" + scheme);
        return launchExternal(activity, view, url, scheme);
    }

    private static boolean launchExternal(Activity activity, WebView view, String url, String scheme) {
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
            Log.w(TAG, "deeplink unparseable scheme=" + scheme + " device=" + deviceTag());
            return true;
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // Diagnostics: which deep link was attempted and on what device.
        // sanitizeUrl() strips query/fragment, so Razorpay order/payment
        // tokens can never land in logcat or crash reports.
        Log.i(TAG, "deeplink attempt scheme=" + scheme
            + " target=" + sanitizeUrl(url)
            + " device=" + deviceTag());

        try {
            activity.startActivity(intent);
            Log.i(TAG, "deeplink launched scheme=" + scheme + " app=" + resolvePackage(activity, intent));
            return true;
        } catch (ActivityNotFoundException notFound) {
            Log.w(TAG, "deeplink no_handler scheme=" + scheme
                + " target=" + sanitizeUrl(url)
                + " fallback=" + (fallbackUrl != null ? "browser" : "toast"));
        }

        if (fallbackUrl != null && view != null) {
            Log.i(TAG, "deeplink fallback browser scheme=" + scheme);
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


    /**
     * The package that will actually handle this intent ("unknown" when the
     * chooser/system will decide). Never null — safe for log strings.
     */
    private static String resolvePackage(Activity activity, Intent intent) {
        try {
            android.content.pm.ResolveInfo ri =
                activity.getPackageManager().resolveActivity(intent, 0);
            if (ri != null && ri.activityInfo != null && ri.activityInfo.packageName != null) {
                return ri.activityInfo.packageName;
            }
        } catch (Exception ignored) {
            /* PackageManager can throw on a finishing activity */
        }
        return "unknown";
    }

    /**
     * Scheme + host/package only. Query strings and fragments are dropped
     * because payment deep links can carry order ids and tokens — those are
     * payment secrets and must never be logged.
     */
    private static String sanitizeUrl(String url) {
        try {
            Uri u = Uri.parse(url);
            String s = new Uri.Builder()
                .scheme(u.getScheme())
                .authority(u.getAuthority())
                .build()
                .toString();
            return s.length() > 120 ? s.substring(0, 120) : s;
        } catch (Exception e) {
            return "(unparseable)";
        }
    }

    private static String deviceTag() {
        return Build.MANUFACTURER + "/" + Build.MODEL + " sdk=" + Build.VERSION.SDK_INT;
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
