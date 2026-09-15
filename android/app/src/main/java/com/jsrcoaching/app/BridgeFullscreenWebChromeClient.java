package com.jsrcoaching.app;

import android.net.Uri;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

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

    @Override
    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        FileChooserParams fileChooserParams
    ) {
        return activity.startFileChooser(filePathCallback, fileChooserParams);
    }
}
