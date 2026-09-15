/**
 * OrderService — creates a Razorpay order.
 *
 * SECURITY: Razorpay Order creation REQUIRES key_secret. NEVER ship key_secret
 * in client code. In production, call your own backend (Node/Express, Supabase
 * Edge Function, Cloud Run, etc.) which holds the secret in an env var and
 * proxies the call to https://api.razorpay.com/v1/orders.
 *
 * The function below returns a MOCK order so the boilerplate runs end-to-end
 * without a backend. Replace `createOrderMock` with `createOrderFromBackend`
 * before going live.
 */

export interface OrderResponse {
  order_id: string;
  amount: number; // paise (INR * 100)
  currency: 'INR';
  key_id: string; // rzp_test_xxx / rzp_live_xxx — PUBLIC, safe in client
}

// TODO: replace with your real Razorpay test key id.
const RAZORPAY_KEY_ID = 'rzp_test_REPLACE_ME';

// TODO: point this to your backend endpoint.
const ORDER_ENDPOINT = '/api/orders';

/** Mock — no backend required. Returns a fake order_id. */
export async function createOrderMock(amountInPaise: number): Promise<OrderResponse> {
  await new Promise((r) => setTimeout(r, 300));
  return {
    order_id: `order_mock_${Date.now()}`,
    amount: amountInPaise,
    currency: 'INR',
    key_id: RAZORPAY_KEY_ID,
  };
}

/** Production — calls your backend which calls Razorpay Orders API. */
export async function createOrderFromBackend(amountInPaise: number): Promise<OrderResponse> {
  const res = await fetch(ORDER_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountInPaise, currency: 'INR' }),
  });
  if (!res.ok) throw new Error(`Order creation failed: ${res.status}`);
  return res.json();
}

// Default export used by PaymentService — swap to backend in production.
export const createOrder = createOrderMock;