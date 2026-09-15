package com.jsrcoaching.app;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Reports why the app's process died last time — WITHOUT adb.
 *
 * Android's `ActivityManager.getHistoricalProcessExitReasons()` (API 30+) is
 * the only in-app source of native-side death reasons: low-memory kills,
 * ANRs, native crashes and "user killed from recents". Before this plugin the
 * JS crash shield could only see failures that happened inside the WebView,
 * so a low-memory kill looked identical to a normal cold start and the only
 * way to confirm it was plugging in a cable and reading `adb logcat`.
 *
 * The JS side (`src/lib/nativeExitInfo.ts`) reads this once per boot,
 * de-duplicates by timestamp and forwards anything abnormal to Sentry.
 */
@CapacitorPlugin(name = "AppExitInfo")
public class AppExitInfoPlugin extends Plugin {

    /** Number of historical records to ask Android for (it keeps up to 16). */
    private static final int MAX_RECORDS = 5;

    @PluginMethod
    public void getExitInfo(PluginCall call) {
        JSObject result = new JSObject();
        JSArray records = new JSArray();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            // API < 30 has no equivalent API. Report "unsupported" rather than
            // an empty list so JS can tell "no crashes" apart from "cannot know".
            result.put("supported", false);
            result.put("records", records);
            call.resolve(result);
            return;
        }

        try {
            Context ctx = getContext();
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) {
                result.put("supported", false);
                result.put("records", records);
                call.resolve(result);
                return;
            }

            List<ApplicationExitInfo> infos =
                    am.getHistoricalProcessExitReasons(ctx.getPackageName(), 0, MAX_RECORDS);

            for (ApplicationExitInfo info : infos) {
                JSObject row = new JSObject();
                row.put("reason", info.getReason());
                row.put("reasonName", reasonName(info.getReason()));
                row.put("status", info.getStatus());
                row.put("importance", info.getImportance());
                row.put("timestamp", info.getTimestamp());
                row.put("pss", info.getPss());
                row.put("rss", info.getRss());
                String desc = info.getDescription();
                row.put("description", desc == null ? "" : desc);
                records.put(row);
            }

            result.put("supported", true);
            result.put("records", records);
            call.resolve(result);
        } catch (Exception e) {
            // Never fail the caller: diagnostics must not become a crash source.
            result.put("supported", false);
            result.put("records", new JSArray());
            result.put("error", String.valueOf(e.getMessage()));
            call.resolve(result);
        }
    }

    /** Human-readable name so Sentry titles stay readable without a lookup table. */
    private static String reasonName(int reason) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return "unknown";
        switch (reason) {
            case ApplicationExitInfo.REASON_LOW_MEMORY: return "low_memory";
            case ApplicationExitInfo.REASON_CRASH: return "crash";
            case ApplicationExitInfo.REASON_CRASH_NATIVE: return "crash_native";
            case ApplicationExitInfo.REASON_ANR: return "anr";
            case ApplicationExitInfo.REASON_SIGNALED: return "signaled";
            case ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE: return "excessive_resource_usage";
            case ApplicationExitInfo.REASON_DEPENDENCY_DIED: return "dependency_died";
            case ApplicationExitInfo.REASON_USER_REQUESTED: return "user_requested";
            case ApplicationExitInfo.REASON_USER_STOPPED: return "user_stopped";
            case ApplicationExitInfo.REASON_INITIALIZATION_FAILURE: return "initialization_failure";
            case ApplicationExitInfo.REASON_PERMISSION_CHANGE: return "permission_change";
            case ApplicationExitInfo.REASON_EXIT_SELF: return "exit_self";
            case ApplicationExitInfo.REASON_OTHER: return "other";
            default: return "unknown";
        }
    }
}
