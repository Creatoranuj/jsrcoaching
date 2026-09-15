import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role using service role client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const { razorpay_payment_id, razorpay_order_id, amount } = body;

    if (!razorpay_payment_id || !razorpay_order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'razorpay_payment_id and razorpay_order_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // AUDIT 2026-08-03 [H1]: previously the Razorpay refund API was called
    // before any DB lookup, so an admin typo (or a replayed request) could
    // refund a payment that does not belong to this project, or double-refund
    // an already-refunded order. Validate the pair and its status first —
    // the external side effect is irreversible.
    const { data: payment, error: paymentErr } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, status, amount, user_id, course_id, razorpay_payment_id, razorpay_order_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (paymentErr) {
      console.error('Payment lookup failed:', paymentErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Could not look up payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payment) {
      return new Response(
        JSON.stringify({ success: false, error: 'No payment found for this order id' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payment.razorpay_payment_id && payment.razorpay_payment_id !== razorpay_payment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'payment_id does not match this order' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payment.status === 'refunded') {
      return new Response(
        JSON.stringify({ success: false, error: 'This payment has already been refunded' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['completed', 'captured', 'paid', 'success'].includes(String(payment.status))) {
      return new Response(
        JSON.stringify({ success: false, error: `Payment is not in a refundable state (status: ${payment.status})` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Partial refunds: `amount` is optional and expressed in paise. Omitted
    // (or null) means a full refund, which is the historical behaviour.
    // `razorpay_payments.amount` is stored in rupees, so compare in paise.
    const paidPaise = Math.round(Number(payment.amount ?? 0) * 100);
    let refundPaise: number | null = null;

    if (amount !== undefined && amount !== null) {
      const parsed = Number(amount);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'amount must be a positive integer in paise' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (paidPaise > 0 && parsed > paidPaise) {
        return new Response(
          JSON.stringify({ success: false, error: `amount exceeds the captured payment (${paidPaise} paise)` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      refundPaise = parsed;
    }

    const isFullRefund = refundPaise === null || (paidPaise > 0 && refundPaise >= paidPaise);

    // Call Razorpay Refund API
    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const refundResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          refundPaise === null
            ? { speed: 'normal' }
            : { speed: 'normal', amount: refundPaise },
        ),
      }
    );

    const refundData = await refundResponse.json();

    if (!refundResponse.ok) {
      console.error('Razorpay refund error:', refundData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: refundData.error?.description || 'Razorpay refund failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // AUDIT 2026-08-03: a dedicated audit row for the refund itself — who
    // triggered it, on what, for how much. `process_refund` writes its own
    // system-level row, but it cannot know the acting admin or refund id.
    // Never let audit-logging failure fail an already-issued refund.
    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      actor_id: user.id,
      user_id: payment.user_id,
      action: isFullRefund ? 'refund.initiated' : 'refund.initiated.partial',
      table_name: 'razorpay_payments',
      entity_type: 'payment',
      entity_id: payment.user_id,
      record_count: 1,
      metadata: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_refund_id: refundData.id ?? null,
        course_id: payment.course_id ?? null,
        amount_paise: refundPaise ?? paidPaise,
        captured_paise: paidPaise,
        is_full: isFullRefund,
      },
    });
    if (auditErr) console.error('Refund audit_log insert failed:', auditErr);

    // Atomic: flip razorpay_payments.status AND (full refunds only)
    // enrollments.status='refunded', so course access is revoked the moment a
    // full refund is initiated. Partial refunds keep access intact.
    const { error: rpcError } = await supabaseAdmin.rpc('process_refund', {
      _razorpay_order_id: razorpay_order_id,
      _is_full: isFullRefund,
      _refund_amount: (refundPaise ?? paidPaise) / 100,
    });

    if (rpcError) {
      console.error('process_refund RPC error:', rpcError);
      // Refund already succeeded on Razorpay — surface but don't fail the response
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Refund succeeded on Razorpay but DB update failed. Reconcile manually.',
          refund_id: refundData.id,
          refund_status: refundData.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isFullRefund
          ? 'Refund initiated successfully'
          : 'Partial refund initiated successfully (course access retained)',
        is_full: isFullRefund,
        amount_paise: refundPaise ?? paidPaise,
        refund_id: refundData.id,
        refund_status: refundData.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Refund error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
