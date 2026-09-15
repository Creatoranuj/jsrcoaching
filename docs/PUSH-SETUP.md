# Push Notifications — Setup Guide

Push uses **FCM** on Android and **APNs** on iOS, wired through
`@capacitor/push-notifications`. The web bundle is a no-op (PWA push not
configured yet).

---

## Android (required before APK build)

1. Go to [Firebase Console](https://console.firebase.google.com/) → create a
   project named **Safar English** (or reuse existing).
2. Add an **Android app** with package name `com.safarenglishka.app`.
3. Download `google-services.json`.
4. Drop the file into `android/app/google-services.json` (do **not** commit
   to public repos — it's already in `.gitignore`).
5. Run `npx cap sync android`. The Capacitor plugin auto-applies the Google
   Services Gradle plugin.
6. Rebuild the APK. Push will start working on real devices.

> **Without `google-services.json` the APK still builds and runs, but
> `PushNotifications.register()` silently fails. App is otherwise fine.**

---

## iOS (when you ship App Store build)

1. Enable **Push Notifications** + **Background Modes → Remote
   notifications** capabilities in Xcode.
2. Create an APNs key in Apple Developer Portal, upload to Firebase project
   settings → Cloud Messaging.
3. `npx cap sync ios`.

---

## Sending a push from an edge function

```ts
// supabase/functions/send-push/index.ts (you create this when needed)
const { data: tokens } = await supabase
  .from("push_tokens")
  .select("token, platform")
  .eq("user_id", recipientUserId);

// POST to FCM HTTP v1 API with your service account
// (see https://firebase.google.com/docs/cloud-messaging/send-message)
```

The `push_tokens` table is created by migration
`20260601130000_push_tokens.sql` and uses RLS so users only see their own
tokens.

---

## Common notification payloads

| Use case | `data.path` (deep-link) |
|---|---|
| New live class starting | `/live` |
| New course unlocked | `/my-courses` |
| Doubt answered | `/doubts` |
| Payment reminder | `/subscription` |

The mobile client reads `data.path` on `pushNotificationActionPerformed`
and routes the user there.
