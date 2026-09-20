package com.jsrcoaching.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Message;
import android.util.Log;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Extends Capacitor's default WebChromeClient behavior to enable Android
 * immersive mode whenever the WebView enters HTML5 fullscreen (used by the
 * in-app video players). This hides both the status bar (top) and the
 * navigation bar (bottom) while a video is fullscreen, and restores them
 * automatically on exit.
 *
 * IMPORTANT: it also forwards onShowFileChooser to the activity. Without this,
 * replacing the default WebChromeClient silently breaks `<input type="file">`
 * — the native file picker never opens, so users can't select local PDFs from
 * device storage (My Library → Add PDF).
 */
public class BridgeFullscreenWebChromeClient extends WebChromeClient {
    private static final String TAG = "RecoveryWebView";

    private final MainActivity activity;

    public BridgeFullscreenWebChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        activity.enterImmersive();
        super.onShowCustomView(view, callback);
    }

    @Override
    public void onHideCustomView() {
        activity.exitImmersive();
        super.onHideCustomView();
    }

    /**
     * Razorpay's checkout opens several UPI tiles with `window.open()` /
     * `target="_blank"`. Those navigations NEVER reach
     * WebViewClient.shouldOverrideUrlLoading, so before this override the tap
     * did nothing at all — the classic "UPI option kuch nahi karta" report.
     *
     * We hand the WebView a throwaway probe view, read the URL it tries to
     * load, then route it: deep-link schemes go to the installed UPI app via
     * RecoveryWebViewClient, plain http(s) popups go to the system browser.
     */
    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        if (resultMsg == null || !(resultMsg.obj instanceof WebView.WebViewTransport)) {
            return false;
        }

        final WebView probe = new WebView(view.getContext());
        probe.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return consume(v, request != null && request.getUrl() != null
                    ? request.getUrl().toString()
                    : null);
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return consume(v, url);
            }

            private boolean consume(WebView v, String url) {
                if (url != null) {
                    routePopupUrl(url);
                }
                try {
                    v.destroy();
                } catch (Exception ignored) {
                    /* already detached */
                }
                return true;
            }
        });

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(probe);
        resultMsg.sendToTarget();
        return true;
    }

    private void routePopupUrl(String url) {
        if (RecoveryWebViewClient.handlePopupUrl(activity, null, url)) {
            return;
        }
        String scheme = RecoveryWebViewClient.schemeOf(url);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            Log.w(TAG, "popup blocked scheme=" + scheme);
            return;
        }
        try {
            Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(browser);
            Log.i(TAG, "popup opened in system browser");
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "popup had no browser handler");
        }
    }

    @Override
    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        FileChooserParams fileChooserParams
    ) {
        return activity.startFileChooser(filePathCallback, fileChooserParams);
    }
}
