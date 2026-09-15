import { razorpayFetchWithRetry, razorpayAuthHeader } from "../_shared/razorpayFetch.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";


function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const A = enc.encode(a), B = enc.encode(b);
  let r = 0;
  for (let i = 0; i < A.length; i++) r |= A[i] ^ B[i];
  return r === 0;
}

// AUDIT 2026-08-03 [H2]: this endpoint had no rate limit at all, so an
// attacker could brute-force signatures / hammer the Razorpay API. Uses the
// shared Postgres limiter, fail-closed.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 10;

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'verify-subscription-payment',
      _user_id: user.id,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      console.error('Rate-limit check failed', {
        user_id: user.id,
        error: rlError.message,
        code: (rlError as { code?: string }).code,
      });
      return new Response(JSON.stringify({ error: 'rate_limiter_unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_slug } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_slug) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const expected = await hmacSha256(RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqual(expected, razorpay_signature)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch plan + verify amount via Razorpay
    const { data: plan, error: planErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('slug, amount_paise, currency, period_days')
      .eq('slug', plan_slug)
      .maybeSingle();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rzpRes = await razorpayFetchWithRetry(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { 'Authorization': razorpayAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) } },
    );
    if (!rzpRes.ok) {
      console.error('Razorpay subscription payment fetch failed', {
        status: rzpRes.status, attempts: rzpRes.attempts, network_error: rzpRes.networkError,
      });
      if (rzpRes.retryable) {
        return new Response(JSON.stringify({
          error: 'razorpay_unreachable',
          retryable: true,
          message: "We couldn't reach Razorpay to confirm. If your money was deducted, activation will happen automatically.",
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Could not verify payment with Razorpay' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const rzpPayment = rzpRes.data ?? {};
    if (rzpPayment.amount !== plan.amount_paise) {
      console.error(`Amount tampering. Expected ${plan.amount_paise}, got ${rzpPayment.amount}`);
      return new Response(JSON.stringify({ error: 'Payment amount mismatch' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (rzpPayment.status !== 'captured') {
      return new Response(JSON.stringify({ error: 'Payment not captured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // IDEMPOTENCY: a Razorpay payment is permanent and its HMAC signature is
    // deterministic, so a client could replay the same credentials to renew for
    // free after expiry. Reject any payment id already used for a subscription.
    const { data: alreadyUsed } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();
    if (alreadyUsed) {
      return new Response(JSON.stringify({ error: 'This payment has already been used to activate a subscription.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Expire any current live subscription for this user
    await supabaseAdmin
      .from('user_subscriptions')
      .update({ status: 'expired' })
      .eq('user_id', user.id)
      .in('status', ['trial', 'active']);

    const now = new Date();
    const periodEnd = new Date(now.getTime() + plan.period_days * 24 * 60 * 60 * 1000);

    const { data: sub, error: insErr } = await supabaseAdmin
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        plan_slug: plan.slug,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
        razorpay_order_id,
        razorpay_payment_id,
        amount_paid_paise: plan.amount_paise,
        currency: plan.currency,
      })
      .select('id, plan_slug, status, current_period_end')
      .single();

    if (insErr) {
      // 23505 = unique_violation on user_subscriptions_payment_id_uidx — a
      // concurrent replay lost the race. Treat as already-used, not a 500.
      if ((insErr as { code?: string }).code === '23505') {
        return new Response(JSON.stringify({ error: 'This payment has already been used to activate a subscription.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.error('Subscription insert error:', insErr);
      return new Response(JSON.stringify({ error: 'Payment verified but subscription activation failed. Contact support.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, subscription: sub }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
