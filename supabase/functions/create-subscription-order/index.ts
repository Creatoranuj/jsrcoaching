import { buildCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";


// AUDIT 2026-08-03 [H3]: this used to be an in-memory Map, which is per-isolate
// under Supabase's edge runtime — the effective limit became RATE_LIMIT_MAX x
// (number of live isolates). Now uses the shared Postgres `check_rate_limit`
// RPC, matching create-razorpay-order / verify-razorpay-payment.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5;

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

    // Service-role client for the shared rate-limit check.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'create-subscription-order',
      _user_id: user.id,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      // Fail-closed: a missing/renamed RPC must not open a bypass window.
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

    const { plan_slug } = await req.json();
    if (!plan_slug || typeof plan_slug !== 'string') {
      return new Response(JSON.stringify({ error: 'plan_slug is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('slug, name, amount_paise, currency, period_days, is_active')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .maybeSingle();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: plan.amount_paise,
        currency: plan.currency || 'INR',
        receipt: `sub_${plan.slug}_${user.id.slice(0, 8)}_${Date.now().toString(36)}`,
        notes: { user_id: user.id, plan_slug: plan.slug, type: 'subscription' },
      }),
    });

    if (!rzpRes.ok) {
      console.error('Razorpay order error:', await rzpRes.text());
      return new Response(JSON.stringify({ error: 'Failed to create Razorpay order' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const order = await rzpRes.json();

    return new Response(JSON.stringify({
      order_id: order.id,
      amount: plan.amount_paise,
      currency: plan.currency || 'INR',
      key_id: RAZORPAY_KEY_ID,
      mode: RAZORPAY_KEY_ID.startsWith('rzp_test_') ? 'test' : 'live',
      plan_name: plan.name,
      plan_slug: plan.slug,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
