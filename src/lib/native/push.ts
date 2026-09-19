/**
 * Push notifications bootstrap.
 *
 * Firebase project jsr-app-403f6 is configured
 * (android/app/google-services.json present, package com.jsrcoaching.app),
 * so PushNotifications.register() is safe to call.
 *
 * History: before google-services.json existed, register() crashed the
 * Android process on permission "Allow" (native FCM init throws — JS
 * try/catch cannot catch it), and the already-granted permission made the
 * crash loop on every launch. Keep google-services.json in the repo;
 * removing it reintroduces that crash.
 *
 * See docs/PUSH-SETUP.md for the full walkthrough.
 */
import { supabase } from "@/integrations/supabase/client";

// Feature flag — google-services.json is in place, so register() is safe.
const PUSH_ENABLED = true;

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
      const path = (action.notification.data as Record<string, unknown> | undefined)?.path;
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
