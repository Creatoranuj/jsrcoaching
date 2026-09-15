import { createClient } from "npm:@supabase/supabase-js@2";
import { razorpayFetchWithRetry } from "../_shared/razorpayFetch.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { course_id } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Postgres-backed rate limit: 5 req / 60s per user, shared across
    // edge-runtime isolates. Without this an attacker could spam Razorpay
    // API lookups (cost + abuse vector).
    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'recover-enrollment',
      _user_id: user.id,
      _max: 5,
      _window_seconds: 60,
    });
    if (rlError) {
      console.error('Rate-limit check failed', { user_id: user.id, error: rlError.message });
    } else if (rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if already enrolled
    const { data: existingEnrollment } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', Number(course_id))
      .eq('status', 'active')
      .maybeSingle();

    if (existingEnrollment) {
      return new Response(JSON.stringify({
        success: true,
        enrollment_id: existingEnrollment.id,
        message: 'Already enrolled',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find a recoverable payment record.
    // IMPORTANT: rows are inserted as 'pending' by create-razorpay-order and only
    // flipped to 'completed' by verify-razorpay-payment. Recovery exists exactly
    // for the case where verify never ran — so we must NOT filter on 'completed'.
    // We consider every non-terminal order and let Razorpay be the source of truth.
    const { data: paymentRows } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, razorpay_order_id, razorpay_payment_id, status, amount, created_at')
      .eq('user_id', user.id)
      .eq('course_id', Number(course_id))
      .not('razorpay_order_id', 'is', null)
      .not('status', 'in', '("refunded","failed")')
      .order('created_at', { ascending: false })
      .limit(5);

    const candidates = (paymentRows ?? []).filter((p) => p.razorpay_order_id);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: 'No payment order found for this course' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify with Razorpay API that payment is genuinely captured
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    // Scan the candidate orders (newest first) for a genuinely captured payment.
    let paymentRecord: (typeof candidates)[number] | null = null;
    let capturedPayment: any = null;
    let sawAmountMismatch = false;

    for (const candidate of candidates) {
      const razorpayRes = await razorpayFetchWithRetry(
        `https://api.razorpay.com/v1/orders/${candidate.razorpay_order_id}/payments`,
        { headers: { 'Authorization': `Basic ${credentials}` } }
      );

      if (!razorpayRes.ok) {
        console.error('Razorpay API error:', candidate.razorpay_order_id, {
          status: razorpayRes.status, attempts: razorpayRes.attempts,
          network_error: razorpayRes.networkError, body: razorpayRes.bodyText,
        });
        continue;
      }

      const razorpayData = razorpayRes.data ?? {};
      const captured = razorpayData.items?.find((p: any) => p.status === 'captured');
      if (!captured) continue;

      // ── AMOUNT TAMPERING CHECK ──
      const expectedAmountPaise = Math.round(Number(candidate.amount) * 100);
      if (captured.amount !== expectedAmountPaise) {
        console.error(`RECOVERY AMOUNT MISMATCH! Expected: ${expectedAmountPaise}, Got: ${captured.amount}. User: ${user.id}, Order: ${candidate.razorpay_order_id}`);
        sawAmountMismatch = true;
        continue;
      }

      paymentRecord = candidate;
      capturedPayment = captured;
      break;
    }

    if (!paymentRecord || !capturedPayment) {
      return new Response(JSON.stringify({
        error: sawAmountMismatch
          ? 'Payment amount mismatch. Contact support.'
          : 'No captured payment found for this course yet. If money was debited, it will be auto-refunded by Razorpay.',
        code: sawAmountMismatch ? 'AMOUNT_MISMATCH' : 'NO_CAPTURED_PAYMENT',
      }), {
        status: sawAmountMismatch ? 400 : 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Payment verified — finalize via atomic RPC (locks payment row,
    // updates status, upserts enrollment — same path as verify-razorpay-payment).
    const { data: enrollmentId, error: enrollError } = await supabaseAdmin.rpc(
      'complete_paid_enrollment',
      {
        _user_id: user.id,
        _course_id: Number(course_id),
        _razorpay_order_id: paymentRecord.razorpay_order_id,
        _razorpay_payment_id: capturedPayment.id,
      }
    );

    if (enrollError || !enrollmentId) {
      console.error('Enrollment RPC error:', enrollError);
      await supabaseAdmin.from('audit_log').insert({
        user_id: user.id,
        action: 'enrollment_recovery_failed',
        table_name: 'enrollments',
        record_count: 0,
        metadata: {
          course_id: Number(course_id),
          razorpay_order_id: paymentRecord.razorpay_order_id,
          reason: enrollError?.message ?? 'rpc_returned_null',
        },
      });
      return new Response(JSON.stringify({ error: 'Payment verified but enrollment failed. Contact support.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const enrollment = { id: enrollmentId };

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id,
      action: 'enrollment_recovered',
      table_name: 'enrollments',
      record_count: 1,
      metadata: {
        course_id: Number(course_id),
        enrollment_id: enrollmentId,
        razorpay_order_id: paymentRecord.razorpay_order_id,
        razorpay_payment_id: capturedPayment.id,
      },
    });

    console.log('Enrollment recovered for user:', user.id, 'course:', course_id);


    return new Response(JSON.stringify({
      success: true,
      enrollment_id: enrollment.id,
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
