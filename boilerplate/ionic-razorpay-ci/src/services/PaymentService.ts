import { Capacitor } from '@capacitor/core';
import { createOrder } from './OrderService';

/**
 * PaymentService — thin wrapper around razorpay-capacitor.
 *
 * Plugin: https://github.com/razorpay/razorpay-capacitor
 * Install: npm i github:razorpay/razorpay-capacitor && npx cap sync android
 *
 * Flow:
 *   1. Ask backend (or mock) for an order_id.
 *   2. Open native Razorpay Checkout via the Capacitor bridge.
 *   3. Resolve with one of: success | failed | cancelled.
 *
 * Verification of payment.signature MUST happen on the backend
 * (HMAC-SHA256 of `${order_id}|${payment_id}` using key_secret).
 * Do NOT trust the client-side success callback alone.
 */

export interface PayOptions {
  amountInPaise: number;
  name: string;
  description: string;
  email?: string;
  contact?: string;
}

export type PayResult =
  | { status: 'success'; payment_id: string; order_id: string; signature: string }
  | { status: 'failed'; code?: string; description?: string }
  | { status: 'cancelled' };

export async function pay(opts: PayOptions): Promise<PayResult> {
  const order = await createOrder(opts.amountInPaise);

  // Web fallback — the native bridge is unavailable in the browser.
  if (!Capacitor.isNativePlatform()) {
    console.warn('[PaymentService] Not on native platform — returning mock success.');
    return {
      status: 'success',
      payment_id: `pay_mock_${Date.now()}`,
      order_id: order.order_id,
      signature: 'mock_signature',
    };
  }

  // Dynamic import keeps the web bundle from breaking when the native module is absent.
  const { Checkout } = await import('razorpay-capacitor');

  return new Promise<PayResult>((resolve) => {
    Checkout.open(
      {
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: opts.name,
        description: opts.description,
        prefill: { email: opts.email, contact: opts.contact },
        theme: { color: '#3880ff' },
      },
      (success: any) =>
        resolve({
          status: 'success',
          payment_id: success.razorpay_payment_id,
          order_id: success.razorpay_order_id,
          signature: success.razorpay_signature,
        }),
      (error: any) => {
        // Razorpay returns a "Payment cancelled" code when the user backs out.
        const desc: string = error?.description || error?.message || '';
        if (
          error?.code === 'PAYMENT_CANCELLED' ||
          /cancel/i.test(desc)
        ) {
          resolve({ status: 'cancelled' });
        } else {
          resolve({ status: 'failed', code: error?.code, description: desc });
        }
      }
    );
  });
}