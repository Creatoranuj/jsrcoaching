/**
 * Push notifications bootstrap.
 *
 * CURRENT STATE: DISABLED until Firebase is configured.
 *
 * The Android app was crashing on "Allow" because `PushNotifications.register()`
 * initializes Firebase Cloud Messaging (FCM), but `android/app/google-services.json`
 * is missing. The native FCM init throws an unrecoverable exception that kills
 * the process — JS try/catch cannot save it. On next launch the OS permission
 * was already "granted", so register() ran again immediately and the app
 * appeared to "not open at all" (instant crash on boot).
 *
 * To re-enable:
 *   1. Create Firebase project at https://console.firebase.google.com
 *   2. Add Android app with package `com.jsrcoaching.app`
 *   3. Download google-services.json → place at android/app/google-services.json
 *   4. git pull → npx cap sync android → rebuild APK
 *   5. Set PUSH_ENABLED = true below
 *
 * See docs/PUSH-SETUP.md for the full walkthrough.
 */
import { supabase } from "@/integrations/supabase/client";

// Feature flag — flip to true ONLY after google-services.json is in place.
const PUSH_ENABLED = false;

let registered = false;

export async function initPushNotifications(userId: string): Promise<void> {
  if (!PUSH_ENABLED) return; // hard kill-switch — no permission prompt, no register()
  if (registered) return;
  // Mark as "attempted" up front so a native crash on register() doesn't loop
  // on next app launch via re-entry from AuthContext.
  registered = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status === "prompt" || status === "prompt-with-rationale") {
      const req = await PushNotifications.requestPermissions();
      status = req.receive;
    }
    if (status !== "granted") return;

    PushNotifications.addListener("registration", async (token) => {
      try {
        const platform = Capacitor.getPlatform();
        await supabase.from("push_tokens").upsert(
          {
            user_id: userId,
            token: token.value,
            platform,
          },
          { onConflict: "token" }
        );
      } catch (e) {
        console.warn("[push] failed to store token:", e);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      // Stay "registered" so we don't retry on next launch and crash again.
      console.warn("[push] registration error:", err);
    });

    PushNotifications.addListener("pushNotificationReceived", (n) => {
      console.log("[push] received:", n);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const path = (action.notification.data as any)?.path;
      if (typeof path === "string" && path.startsWith("/")) {
        // Route through React Router (see usePushNav) instead of reloading the WebView.
        window.dispatchEvent(new CustomEvent("nb:push-nav", { detail: { path } }));
      }
    });

    try {
      // Android 8+ requires an explicit channel for notifications to display.
      // Safe to call before register(); no-op on iOS.
      if (Capacitor.getPlatform() === "android") {
        try {
          await PushNotifications.createChannel({
            id: "nb_default",
            name: "JSR COACHING",
            description: "Class reminders, doubt replies & announcements",
            importance: 4, // HIGH — heads-up display
            visibility: 1,
            lights: true,
            vibration: true,
          });
        } catch (e) {
          console.warn("[push] createChannel failed:", e);
        }
      }
      await PushNotifications.register();
    } catch (e) {
      console.warn("[push] register() failed (likely missing google-services.json):", e);
    }

  } catch (e) {
    console.warn("[push] init failed:", e);
  }
}
