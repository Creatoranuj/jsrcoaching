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
 *   MainActivity implements PaymentResultWithDataListener -> success / error
 *
 * HOW THE RESULT COMES BACK (this is the part that was broken):
 * `com.razorpay:checkout` is a thin wrapper around `com.razorpay:standard-core`.
 * In standard-core 1.7.x `Checkout` is an `android.app.Fragment`: open()
 * attaches it to the host Activity, the fragment starts CheckoutActivity itself
 * and receives the Activity result in the fragment's own onActivityResult. It
 * then hands the outcome to the HOST ACTIVITY through
 * PaymentResultWithDataListener / PaymentResultListener (interface first,
 * reflection second). The host Activity's onActivityResult(RZP_REQUEST_CODE)
 * is never invoked for a fragment-started Activity. So the result MUST be
 * accepted through {@link #deliverSuccess}/{@link #deliverError} from
 * MainActivity's listener methods. {@link #handleCheckoutResult} is kept only
 * for older SDK cores that still start the Activity from the host.
 */
@CapacitorPlugin(name = "RazorpayNative")
public class RazorpayNativePlugin extends Plugin {

    /**
     * The single in-flight checkout. Access is synchronized so double taps,
     * watchdog cancellation, and late results (from either callback path)
     * can never settle the wrong JavaScript promise or settle one twice.
     */
    private static final Object PENDING_LOCK = new Object();
    private static PluginCall pendingCall;

    /**
     * True between a successful {@code checkout.open()} and its result.
     * Together with {@link #hostResumed} this tells us whether the Razorpay
     * checkout Activity is genuinely still on screen — the JS watchdog must
     * never tear down a live payment sheet.
     */
    private static volatile boolean checkoutLaunched;

    /** True while our own WebView Activity is the foreground surface. */
    private static volatile boolean hostResumed = true;

    @Override
    protected void handleOnResume() {
        hostResumed = true;
    }

    @Override
    protected void handleOnPause() {
        hostResumed = false;
    }

    private static boolean hasPending() {
        synchronized (PENDING_LOCK) {
            return pendingCall != null;
        }
    }

    private static PluginCall takePending() {
        synchronized (PENDING_LOCK) {
            final PluginCall call = pendingCall;
            pendingCall = null;
            checkoutLaunched = false;
            return call;
        }
    }

    private static void rejectCall(PluginCall call, String code, String description) {
        call.setKeepAlive(false);
        call.reject(
            "{\"code\":" + JSONObject.quote(code)
                + ",\"description\":" + JSONObject.quote(description) + "}",
            code
        );
    }

    private static void rejectPending(String code, String description) {
        final PluginCall call = takePending();
        if (call == null) return;
        rejectCall(call, code, description);
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

        JSObject options = call.getData();

        try {
            JSONObject payload = new JSONObject(options.toString());
            // `key` is passed via setKeyID; leaving it in the payload is harmless
            // but we drop the plugin-internal callback id Capacitor injects.
            payload.remove("callbackId");

            Checkout checkout = new Checkout();
            checkout.setKeyID(key);

            call.setKeepAlive(true);
            synchronized (PENDING_LOCK) {
                if (pendingCall != null) {
                    rejectCall(call, "ALREADY_IN_PROGRESS", "A checkout is already open");
                    return;
                }
                pendingCall = call;
            }
            // Capacitor plugin methods may execute off the Android UI thread.
            // Razorpay attaches a Fragment / starts an Activity and must always
            // be opened on it.
            activity.runOnUiThread(() -> {
                try {
                    checkout.open(activity, payload);
                    checkoutLaunched = true;
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

    /**
     * Called when the JS launch watchdog expires.
     *
     * Resolves {@code dismissed:false} — WITHOUT rejecting the pending call —
     * while the Razorpay checkout Activity is still open on top of our WebView.
     * Cancelling in that state dropped a live payment's callback and left the
     * user on a payment screen wired to nothing. Only a sheet that is really
     * gone is cancelled and reported as {@code dismissed:true}.
     */
    @PluginMethod
    public void cancel(PluginCall call) {
        final JSObject out = new JSObject();
        synchronized (PENDING_LOCK) {
            if (pendingCall != null && checkoutLaunched && !hostResumed) {
                out.put("dismissed", false);
                call.resolve(out);
                return;
            }
        }
        rejectPending("LAUNCH_CANCELLED", "Checkout launch was cancelled");
        out.put("dismissed", true);
        call.resolve(out);
    }

    /** Warms up Razorpay so the method list (incl. UPI apps) is ready on first open. */
    public static void preload(android.content.Context context) {
        try {
            Checkout.preload(context.getApplicationContext());
        } catch (Throwable ignored) {
            // Preload is an optimisation only — never block app start on it.
        }
    }

    // ---------------------------------------------------------------------
    // Result delivery. Both callback paths (SDK 1.7.x fragment -> Activity
    // listener, and legacy Activity#onActivityResult) end up here, and
    // takePending() guarantees exactly one settlement per checkout.
    // ---------------------------------------------------------------------

    /**
     * Success handed over by Razorpay. Validates the three signed fields the
     * server needs before resolving; an incomplete payload is rejected so the
     * UI can point the user at webhook-based recovery instead of sending
     * unsigned data to verification.
     * @return true when a pending checkout was settled by this call.
     */
    public static boolean deliverSuccess(String razorpayPaymentId, PaymentData paymentData) {
        final PluginCall call = takePending();
        if (call == null) return false;
        try {
            final String orderId = paymentData == null ? null : paymentData.getOrderId();
            final String signature = paymentData == null ? null : paymentData.getSignature();
            if (razorpayPaymentId == null || razorpayPaymentId.trim().isEmpty()
                || orderId == null || orderId.trim().isEmpty()
                || signature == null || signature.trim().isEmpty()) {
                rejectCall(call, "INCOMPLETE_RESPONSE", "Payment response was incomplete");
                return true;
            }
            JSObject response = new JSObject();
            response.put("razorpay_payment_id", razorpayPaymentId);
            response.put("razorpay_order_id", orderId);
            response.put("razorpay_signature", signature);
            JSObject result = new JSObject();
            result.put("response", response);
            call.setKeepAlive(false);
            call.resolve(result);
        } catch (Throwable t) {
            String msg = t.getMessage() == null ? "Checkout result handling failed" : t.getMessage();
            rejectCall(call, "RESULT_FAILED", msg);
        }
        return true;
    }

    /**
     * Failure / cancellation handed over by Razorpay.
     * @return true when a pending checkout was settled by this call.
     */
    public static boolean deliverError(int code, String description, PaymentData paymentData) {
        final PluginCall call = takePending();
        if (call == null) return false;
        JSONObject err = new JSONObject();
        try {
            err.put("code", code);
            err.put("description", description == null ? "Payment failed" : description);
            // Razorpay uses code 0 / 2 for user cancellation depending on flow.
            if (code == Checkout.PAYMENT_CANCELED
                || (description != null && description.toLowerCase().contains("cancel"))) {
                err.put("reason", "payment_cancelled");
            }
            if (paymentData != null && paymentData.getOrderId() != null) {
                err.put("order_id", paymentData.getOrderId());
            }
        } catch (Exception ignored) {
        }
        call.setKeepAlive(false);
        call.reject(err.toString(), String.valueOf(code));
        return true;
    }

    /**
     * An external wallet (e.g. Paytm redirect) was chosen. We never enable
     * `external.wallets`, so this is only a safety net: settle the promise
     * rather than leaving the CTA on "Opening payment…".
     * @return true when a pending checkout was settled by this call.
     */
    public static boolean deliverExternalWallet(String walletName) {
        final PluginCall call = takePending();
        if (call == null) return false;
        JSONObject err = new JSONObject();
        try {
            err.put("code", "EXTERNAL_WALLET");
            err.put("description", "External wallet selected: " + walletName);
        } catch (Exception ignored) {
        }
        call.setKeepAlive(false);
        call.reject(err.toString(), "EXTERNAL_WALLET");
        return true;
    }

    /**
     * Legacy path — called from MainActivity#onActivityResult. Only older SDK
     * cores (Activity-started CheckoutActivity) ever reach this; with the
     * fragment-based core the SDK delivers through the listener methods above.
     * @return true when this plugin consumed the result.
     */
    public static boolean handleCheckoutResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != Checkout.RZP_REQUEST_CODE) {
            return false;
        }
        if (!hasPending()) {
            return false;
        }

        try {
            Checkout.handleActivityResult(activity, requestCode, resultCode, data,
                new PaymentResultWithDataListener() {
                    @Override
                    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
                        deliverSuccess(razorpayPaymentId, paymentData);
                    }

                    @Override
                    public void onPaymentError(int code, String description, PaymentData paymentData) {
                        deliverError(code, description, paymentData);
                    }
                },
                new ExternalWalletListener() {
                    @Override
                    public void onExternalWalletSelected(String walletName, PaymentData paymentData) {
                        deliverExternalWallet(walletName);
                    }
                });
        } catch (Throwable t) {
            String msg = t.getMessage() == null ? "Checkout result handling failed" : t.getMessage();
            rejectPending("RESULT_FAILED", msg);
        }
        // If the SDK invoked no listener at all, never leave JS hanging.
        if (hasPending()) {
            rejectPending("RESULT_FAILED", "Checkout returned without a result");
        }
        return true;
    }
}
