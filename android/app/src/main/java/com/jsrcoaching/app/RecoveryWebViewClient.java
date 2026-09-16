package com.jsrcoaching.app;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

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
    private final Activity activity;

    public RecoveryWebViewClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
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
