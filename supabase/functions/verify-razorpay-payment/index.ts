import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { razorpayFetchWithRetry, razorpayAuthHeader } from "../_shared/razorpayFetch.ts";


// Rate limiting is enforced via Postgres `public.check_rate_limit`
// (5 req / 60 s per user, bucket = 'verify-razorpay-payment'). Per-instance
// in-memory limits are insufficient — Supabase edge runtime spins multiple
// isolates that don't share memory.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5;


// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Local JWT verification via getClaims — avoids 401s from stale
    // server-side sessions (Phase-1 alignment with manage-session /
    // get-lesson-url).
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub as string } : null;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use service role for DB writes + rate-limit check (shared across instances)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Postgres-backed rate limit check
    const { data: allowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'verify-razorpay-payment',
      _user_id: user.id,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      // Fail-closed: if the rate limiter is unavailable we refuse rather than
      // silently letting requests through. A DB migration drift or renamed RPC
      // must NOT open a bypass window.
      console.error('Rate-limit check failed', {
        user_id: user.id,
        error: rlError.message,
        code: (rlError as { code?: string }).code,
        details: (rlError as { details?: string }).details,
        hint: (rlError as { hint?: string }).hint,
      });
      return new Response(JSON.stringify({ error: 'rate_limiter_unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (allowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, course_id } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !course_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;
    if (!RAZORPAY_KEY_SECRET || !RAZORPAY_KEY_ID) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify HMAC-SHA256 signature with timing-safe comparison
    const expectedSignature = await hmacSha256(
      RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );

    if (!timingSafeEqual(expectedSignature, razorpay_signature)) {
      // Structured forensic log — never include the signature value itself
      console.error('Razorpay signature mismatch', {
        user_id: user.id,
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        course_id,
      });
      return new Response(JSON.stringify({ error: 'Payment verification failed: invalid signature' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // supabaseAdmin already created above for rate-limit check


    // ── AMOUNT TAMPERING + COURSE SUBSTITUTION CHECK ──
    // Fetch the stored payment record scoped to BOTH user_id AND course_id.
    // Without the course_id filter, an attacker could pay for a cheap course
    // and call verify with a premium course_id to enroll in a different course.
    const { data: paymentRecord } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, amount, course_id, user_id, status')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)
      .eq('course_id', Number(course_id))
      .maybeSingle();

    if (!paymentRecord) {
      console.error('No payment record found for order/course pair:', razorpay_order_id, course_id);
      return new Response(JSON.stringify({ error: 'Payment record not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Defence-in-depth: even though the SELECT above is scoped by user_id,
    // assert explicitly. If a future RLS/column change loosens the query,
    // this line still blocks cross-user replay.
    if (paymentRecord.user_id !== user.id) {
      console.error('Cross-user replay blocked', {
        caller: user.id, record_user: paymentRecord.user_id, order_id: razorpay_order_id,
      });
      return new Response(JSON.stringify({ error: 'Payment record ownership mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Refunded orders must never re-enroll.
    if (paymentRecord.status === 'refunded') {
      return new Response(JSON.stringify({ error: 'Order was refunded' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Idempotent replay of a successful verify → return existing enrollment
    // without going back to Razorpay or re-running the RPC.
    if (paymentRecord.status === 'completed') {
      const { data: existingEnrollment } = await supabaseAdmin
        .from('enrollments')
        .select('id')
        .eq('user_id', user.id)
        .eq('course_id', Number(course_id))
        .maybeSingle();
      return new Response(JSON.stringify({
        success: true,
        enrollment_id: existingEnrollment?.id ?? null,
        idempotent: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    // Verify actual paid amount via Razorpay API (retry + backoff on transient errors)
    const rzpRes = await razorpayFetchWithRetry(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { 'Authorization': razorpayAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) } },
    );

    if (!rzpRes.ok) {
      console.error('Razorpay payment fetch failed', {
        order_id: razorpay_order_id,
        status: rzpRes.status,
        attempts: rzpRes.attempts,
        network_error: rzpRes.networkError,
        body: rzpRes.bodyText,
      });
      if (rzpRes.retryable) {
        // Transient Razorpay outage — the payment is very likely captured.
        // Signal the client to fall back to recover-enrollment / webhook
        // instead of showing a hard failure.
        return new Response(JSON.stringify({
          error: 'razorpay_unreachable',
          retryable: true,
          message: "We couldn't reach Razorpay to confirm. If your money was deducted, enrollment will happen automatically.",
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Failed to verify payment amount with Razorpay' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rzpPayment = rzpRes.data ?? {};

    // Razorpay returns amount in paise, DB stores in rupees
    const expectedAmountPaise = Math.round(paymentRecord.amount * 100);
    if (rzpPayment.amount !== expectedAmountPaise) {
      console.error(`AMOUNT TAMPERING DETECTED! Expected: ${expectedAmountPaise} paise, Got: ${rzpPayment.amount} paise. User: ${user.id}, Order: ${razorpay_order_id}`);
      return new Response(JSON.stringify({ error: 'Payment amount mismatch. Contact support.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Also verify payment status is captured
    if (rzpPayment.status !== 'captured') {
      console.error(`Payment not captured. Status: ${rzpPayment.status}. Order: ${razorpay_order_id}`);
      return new Response(JSON.stringify({ error: 'Payment not captured on Razorpay. Contact support.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Atomic: mark payment completed AND upsert enrollment in a single txn.
    // Either both happen or neither — no "paid but not enrolled" state.
    const { data: enrollmentId, error: rpcError } = await supabaseAdmin.rpc(
      'complete_paid_enrollment',
      {
        _user_id: user.id,
        _course_id: Number(course_id),
        _razorpay_order_id: razorpay_order_id,
        _razorpay_payment_id: razorpay_payment_id,
      }
    );

    if (rpcError) {
      console.error('complete_paid_enrollment failed:', rpcError);
      return new Response(JSON.stringify({ error: 'Payment verified but enrollment failed. Contact support.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      enrollment_id: enrollmentId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
