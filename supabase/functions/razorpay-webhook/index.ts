import { createClient } from "npm:@supabase/supabase-js@2";

// No CORS headers — this is a server-to-server webhook endpoint
const jsonHeaders = { 'Content-Type': 'application/json' };

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

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function logSecurityAlert(
  supabaseAdmin: ReturnType<typeof createClient>,
  alertType: string,
  details: Record<string, unknown>,
  sourceIp: string | null
) {
  try {
    await supabaseAdmin.from('security_alerts').insert({
      alert_type: alertType,
      details,
      source_ip: sourceIp,
    });
  } catch (e) {
    console.error('Failed to log security alert:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: jsonHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: jsonHeaders
    });
  }

  const sourceIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null;

  try {
    const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!WEBHOOK_SECRET) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: jsonHeaders
      });
    }

    const rawBody = await req.text();
    const razorpaySignature = req.headers.get('x-razorpay-signature');

    if (!razorpaySignature) {
      console.error('Missing x-razorpay-signature header');
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        status: 400, headers: jsonHeaders
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify HMAC-SHA256 with timing-safe comparison
    const expectedSignature = await hmacSha256(WEBHOOK_SECRET, rawBody);

    if (!timingSafeEqual(expectedSignature, razorpaySignature)) {
      console.error('Webhook signature mismatch — possible tampering attempt');
      await logSecurityAlert(supabaseAdmin, 'webhook_signature_mismatch', {
        webhook: 'razorpay-webhook',
        event: 'payment.captured',
        message: 'HMAC signature verification failed — possible replay or tampering attack',
      }, sourceIp);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400, headers: jsonHeaders
      });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    console.log('Razorpay webhook event:', event);

    // ── REPLAY PROTECTION: check event_id, INSERT only AFTER success. ──
    // Previous version inserted the dedupe row immediately after signature
    // verify. If the enrollment step then failed, Razorpay's retry would
    // hit the unique constraint (23505), short-circuit as `duplicate_event`,
    // and the user would stay unenrolled forever. We now:
    //   1. SELECT to short-circuit obvious repeats.
    //   2. Run all side-effects.
    //   3. INSERT the dedupe row at the end. A concurrent retry that races
    //      past step 1 will race safely — the RPC is itself idempotent
    //      (ON CONFLICT DO UPDATE on enrollments) and the final INSERT is
    //      wrapped in a 23505 handler.
    const eventId = req.headers.get('x-razorpay-event-id') || payload.id;
    if (eventId) {
      const { data: prior } = await supabaseAdmin
        .from('webhook_events')
        .select('event_id')
        .eq('event_id', eventId)
        .maybeSingle();
      if (prior) {
        console.log('Duplicate webhook event ignored:', eventId);
        return new Response(JSON.stringify({ status: 'duplicate_event' }), {
          status: 200, headers: jsonHeaders
        });
      }
    }

    if (event !== 'payment.captured') {
      return new Response(JSON.stringify({ status: 'ignored', event }), {
        status: 200, headers: jsonHeaders
      });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      console.error('No payment entity in webhook payload');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400, headers: jsonHeaders
      });
    }

    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;
    const courseId = payment.notes?.course_id;
    const userId = payment.notes?.user_id;

    if (!razorpayOrderId || !razorpayPaymentId) {
      console.error('Missing order_id or payment_id in webhook');
      return new Response(JSON.stringify({ error: 'Missing payment identifiers' }), {
        status: 400, headers: jsonHeaders
      });
    }

    // ── IDEMPOTENCY CHECK ──
    const { data: existingPayment } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, status, amount, user_id, course_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (existingPayment?.status === 'completed') {
      console.log('Webhook already processed for order:', razorpayOrderId);
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        status: 200, headers: jsonHeaders
      });
    }

    // ── AMOUNT TAMPERING CHECK (unconditional) ──
    // SEC: previously this was gated on `if (existingPayment)`. If the
    // pre-order insert in create-razorpay-order silently failed, no DB row
    // existed for this order → amount check was skipped entirely and the
    // webhook would enroll the user purely on the strength of the Razorpay
    // signature + `notes` payload. We now ALWAYS re-derive the expected
    // amount from the DB course price (the same source create-razorpay-order
    // used) and compare to the paid amount from the signed webhook payload.
    if (existingPayment) {
      const expectedAmountPaise = Math.round(existingPayment.amount * 100);
      if (payment.amount !== expectedAmountPaise) {
        console.error(`WEBHOOK AMOUNT TAMPERING! Expected: ${expectedAmountPaise}, Got: ${payment.amount}. Order: ${razorpayOrderId}`);
        await logSecurityAlert(supabaseAdmin, 'amount_tampering', {
          webhook: 'razorpay-webhook',
          razorpay_order_id: razorpayOrderId,
          expected_paise: expectedAmountPaise,
          received_paise: payment.amount,
          user_id: userId,
          course_id: courseId,
          message: 'Payment amount does not match order — possible price manipulation',
        }, sourceIp);
        return new Response(JSON.stringify({ error: 'Amount mismatch' }), {
          status: 400, headers: jsonHeaders
        });
      }
    } else if (courseId) {
      // Fallback: no pre-order row found. Re-derive expected price from DB
      // course row directly so we never enroll without amount validation.
      const { data: courseRow } = await supabaseAdmin
        .from('courses')
        .select('price')
        .eq('id', Number(courseId))
        .maybeSingle();
      const dbPrice = courseRow?.price;
      if (!dbPrice || dbPrice <= 0) {
        console.error('Webhook for course with no/zero price — refusing enrollment', { courseId, razorpayOrderId });
        await logSecurityAlert(supabaseAdmin, 'webhook_missing_price', {
          webhook: 'razorpay-webhook',
          razorpay_order_id: razorpayOrderId,
          course_id: courseId,
          message: 'No pre-order record and course price unavailable — refusing to grant enrollment',
        }, sourceIp);
        return new Response(JSON.stringify({ error: 'Course price unavailable' }), {
          status: 400, headers: jsonHeaders
        });
      }
      const expectedAmountPaise = Math.round(Number(dbPrice) * 100);
      if (payment.amount !== expectedAmountPaise) {
        console.error(`WEBHOOK AMOUNT TAMPERING (no pre-order)! Expected: ${expectedAmountPaise}, Got: ${payment.amount}. Order: ${razorpayOrderId}`);
        await logSecurityAlert(supabaseAdmin, 'amount_tampering', {
          webhook: 'razorpay-webhook',
          razorpay_order_id: razorpayOrderId,
          expected_paise: expectedAmountPaise,
          received_paise: payment.amount,
          user_id: userId,
          course_id: courseId,
          message: 'Pre-order row missing AND amount does not match current course price',
        }, sourceIp);
        return new Response(JSON.stringify({ error: 'Amount mismatch' }), {
          status: 400, headers: jsonHeaders
        });
      }
    } else {
      // No existingPayment AND no course_id in notes — refuse outright.
      console.error('Webhook missing both pre-order row and notes.course_id — refusing', { razorpayOrderId });
      return new Response(JSON.stringify({ error: 'Insufficient payment context' }), {
        status: 400, headers: jsonHeaders
      });
    }

    // ── ATOMIC ENROLLMENT via complete_paid_enrollment RPC ──
    // Same code path as verify-razorpay-payment: marks the payment
    // completed AND upserts the enrollment AND writes audit_log in a
    // single transaction. If any step fails, the whole webhook fails so
    // Razorpay's automatic retry can re-attempt (because we have NOT yet
    // written the webhook_events dedupe row).
    // Prefer the DB row (source of truth) over notes for user/course when
    // available. `notes` are HMAC-signed as part of the webhook body but
    // originate from the frontend-triggered order create, so the DB row is
    // the stronger provenance. Cross-check both when both are present.
    const trustedUserId = existingPayment?.user_id ?? userId;
    const trustedCourseId = existingPayment?.course_id ?? (courseId ? Number(courseId) : null);

    if (existingPayment && userId && existingPayment.user_id !== userId) {
      console.error('Webhook notes.user_id disagrees with DB row — using DB', {
        db_user: existingPayment.user_id, notes_user: userId, order_id: razorpayOrderId,
      });
      await logSecurityAlert(supabaseAdmin, 'webhook_user_mismatch', {
        webhook: 'razorpay-webhook',
        razorpay_order_id: razorpayOrderId,
        db_user_id: existingPayment.user_id,
        notes_user_id: userId,
      }, sourceIp);
    }

    if (trustedCourseId && trustedUserId) {
      const { error: rpcError } = await supabaseAdmin.rpc(
        'complete_paid_enrollment',
        {
          _user_id: trustedUserId,
          _course_id: Number(trustedCourseId),
          _razorpay_order_id: razorpayOrderId,
          _razorpay_payment_id: razorpayPaymentId,
        },
      );
      if (rpcError) {
        console.error('Webhook complete_paid_enrollment failed — will let Razorpay retry', {
          code: (rpcError as { code?: string }).code,
          message: (rpcError as { message?: string }).message,
        });
        return new Response(JSON.stringify({ error: 'Enrollment failed, please retry' }), {
          status: 500, headers: jsonHeaders
        });
      }
      console.log('Enrollment completed via webhook RPC', { user_id: trustedUserId, course_id: trustedCourseId });
    } else {
      // No notes.user_id/course_id — at least mark the payment completed so
      // audit/admin can reconcile manually. Still not fatal.
      const { error: updateError } = await supabaseAdmin
        .from('razorpay_payments')
        .update({
          razorpay_payment_id: razorpayPaymentId,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('razorpay_order_id', razorpayOrderId);
      if (updateError) {
        console.error('Failed to update payment (no notes):', updateError);
      }
    }

    // ── COMMIT DEDUPE ROW ── only after successful processing.
    if (eventId) {
      const { error: dedupeErr } = await supabaseAdmin
        .from('webhook_events')
        .insert({ event_id: eventId, source: 'razorpay', event_type: event });
      if (dedupeErr && (dedupeErr as { code?: string }).code !== '23505') {
        console.error('Failed to record webhook_event (non-fatal):', dedupeErr);
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200, headers: jsonHeaders
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: jsonHeaders
    });
  }
});
