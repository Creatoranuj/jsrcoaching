package com.jsrcoaching.app;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.razorpay.Checkout;
import com.razorpay.ExternalWalletListener;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import org.json.JSONObject;

/**
 * Native Razorpay checkout bridge.
 *
 * Replaces the third-party `capacitor-razorpay` plugin, which launched
 * Razorpay's CheckoutActivity through a raw Intent. That bypassed
 * Checkout.open()/preload() and, as a side effect, Razorpay never rendered the
 * UPI intent tiles (GPay / PhonePe / Paytm) because it could not hand control
 * to a third-party UPI app. Card + netbanking kept working, which is exactly
 * the symptom users reported.
 *
 * This plugin uses the officially documented Android integration:
 *   Checkout.preload(applicationContext)  -> warms up available methods
 *   checkout.setKeyID(key); checkout.open(activity, options)
 *   Checkout.handleActivityResult(...)    -> success / error / wallet
 */
@CapacitorPlugin(name = "RazorpayNative")
public class RazorpayNativePlugin extends Plugin {

    /**
     * Razorpay's SDK starts its own activity via `activity.startActivityForResult`,
     * so the result arrives on MainActivity, not on a Capacitor
     * ActivityResultLauncher. MainActivity#onActivityResult forwards it here.
     * Only one checkout can be open at a time, so a single static slot is safe.
     */
    private static PluginCall pendingCall;

    private static void rejectPending(String code, String description) {
        final PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        call.setKeepAlive(false);
        call.reject(
            "{\"code\":" + JSONObject.quote(code)
                + ",\"description\":" + JSONObject.quote(description) + "}",
            code
        );
    }

    @PluginMethod
    public void open(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("{\"code\":\"NO_ACTIVITY\",\"description\":\"Activity unavailable\"}", "NO_ACTIVITY");
            return;
        }

        final String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) {
            call.reject("{\"code\":\"MISSING_KEY\",\"description\":\"Razorpay key is required\"}", "MISSING_KEY");
            return;
        }

        // Reject any stale call rather than leaking it.
        rejectPending("SUPERSEDED", "A new checkout was started");

        JSObject options = call.getData();

        try {
            JSONObject payload = new JSONObject(options.toString());
            // `key` is passed via setKeyID; leaving it in the payload is harmless
            // but we drop the plugin-internal callback id Capacitor injects.
            payload.remove("callbackId");

            Checkout checkout = new Checkout();
            checkout.setKeyID(key);

            call.setKeepAlive(true);
            pendingCall = call;
            // Capacitor plugin methods may execute off the Android UI thread.
            // Razorpay starts an Activity and must always be opened on it.
            activity.runOnUiThread(() -> {
                try {
                    checkout.open(activity, payload);
                } catch (Throwable t) {
                    String msg = t.getMessage() == null ? "Unable to open checkout" : t.getMessage();
                    rejectPending("OPEN_FAILED", msg);
                }
            });
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "Unable to open checkout" : e.getMessage();
            rejectPending("OPEN_FAILED", msg);
        }
    }

    /** Cancels the JS bridge call after its launch watchdog expires. */
    @PluginMethod
    public void cancel(PluginCall call) {
        rejectPending("LAUNCH_CANCELLED", "Checkout launch was cancelled");
        call.resolve();
    }

    /** Warms up Razorpay so the method list (incl. UPI apps) is ready on first open. */
    public static void preload(android.content.Context context) {
        try {
            Checkout.preload(context.getApplicationContext());
        } catch (Throwable ignored) {
            // Preload is an optimisation only — never block app start on it.
        }
    }

    /**
     * Called from MainActivity#onActivityResult.
     * @return true when this plugin consumed the result.
     */
    public static boolean handleCheckoutResult(Activity activity, int requestCode, int resultCode, Intent data) {
        final PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) {
            return false;
        }

        try {
            Checkout.handleActivityResult(activity, requestCode, resultCode, data,
                new PaymentResultWithDataListener() {
                    @Override
                    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
                        JSObject response = new JSObject();
                        response.put("razorpay_payment_id", razorpayPaymentId);
                        if (paymentData != null) {
                            response.put("razorpay_order_id", paymentData.getOrderId());
                            response.put("razorpay_signature", paymentData.getSignature());
                        }
                        JSObject result = new JSObject();
                        result.put("response", response);
                        call.setKeepAlive(false);
                        call.resolve(result);
                    }

                    @Override
                    public void onPaymentError(int code, String description, PaymentData paymentData) {
                        JSONObject err = new JSONObject();
                        try {
                            err.put("code", code);
                            err.put("description", description == null ? "Payment failed" : description);
                            // Razorpay uses code 0 / 2 for user cancellation depending on flow.
                            if (description != null && description.toLowerCase().contains("cancel")) {
                                err.put("reason", "payment_cancelled");
                            }
                        } catch (Exception ignored) {
                        }
                        call.setKeepAlive(false);
                        call.reject(err.toString(), String.valueOf(code));
                    }
                },
                new ExternalWalletListener() {
                    @Override
                    public void onExternalWalletSelected(String walletName, PaymentData paymentData) {
                        JSONObject err = new JSONObject();
                        try {
                            err.put("code", "EXTERNAL_WALLET");
                            err.put("description", "External wallet selected: " + walletName);
                        } catch (Exception ignored) {
                        }
                        call.setKeepAlive(false);
                        call.reject(err.toString(), "EXTERNAL_WALLET");
                    }
                });
        } catch (Throwable t) {
            String msg = t.getMessage() == null ? "Checkout result handling failed" : t.getMessage();
            call.setKeepAlive(false);
            call.reject("{\"code\":\"RESULT_FAILED\",\"description\":" + JSONObject.quote(msg) + "}", "RESULT_FAILED");
        }
        return true;
    }
}
