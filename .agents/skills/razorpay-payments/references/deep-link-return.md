# Deep-link return (Android)

Only needed when the user leaves the app during payment (UPI collect, bank OTP page that redirects). The standard native-plugin flow resolves in-app and does **not** need this.

## Route

`/payment-callback?razorpay_payment_id=...&razorpay_order_id=...&razorpay_signature=...&course_id=...`

Implemented in `src/pages/PaymentCallback.tsx`. It calls `verify-razorpay-payment` and routes to `/my-courses` on success.

## Android — AndroidManifest.xml

Add inside `<activity android:name=".MainActivity">`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" />
  <data android:host="naveenbharat.app" />   <!-- replace with real domain -->
  <data android:pathPrefix="/payment-callback" />
</intent-filter>
```

## Host `assetlinks.json`

`https://<domain>/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.lovable.c9bbffec5b60411dbca7729d83820c83",
    "sha256_cert_fingerprints": ["<SHA256 from release keystore>"]
  }
}]
```

Get fingerprint:
```bash
keytool -list -v -keystore release.keystore -alias <alias>
```

## App-side handler

Already wire-able with `@capacitor/app`:

```ts
import { App } from "@capacitor/app";

App.addListener("appUrlOpen", ({ url }) => {
  const u = new URL(url);
  if (u.pathname.startsWith("/payment-callback")) {
    navigate(u.pathname + u.search);
  }
});

// Cold start
const launch = await App.getLaunchUrl();
if (launch?.url) handle(launch.url);
```

## Razorpay callback_url

When using redirect mode, set:
```
callback_url: "https://naveenbharat.app/payment-callback?course_id=" + id
```

App Links will catch this and open the app instead of the browser. If verification fails on the client, the webhook still completes enrollment within seconds.
