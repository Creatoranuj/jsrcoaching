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
      console.error('Refund webhook signature mismatch — possible tampering attempt');
      await logSecurityAlert(supabaseAdmin, 'webhook_signature_mismatch', {
        webhook: 'razorpay-refund-webhook',
        event: 'payment.refunded',
        message: 'HMAC signature verification failed — possible replay or tampering attack',
      }, sourceIp);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400, headers: jsonHeaders
      });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    console.log('Razorpay refund webhook event:', event);

    // ── REPLAY PROTECTION: record event_id to webhook_events ──
    const eventId = req.headers.get('x-razorpay-event-id') || payload.id;
    if (eventId) {
      const { error: replayError } = await supabaseAdmin
        .from('webhook_events')
        .insert({ event_id: eventId, source: 'razorpay-refund', event_type: event });
      if (replayError) {
        if ((replayError as { code?: string }).code === '23505') {
          console.log('Duplicate refund webhook event ignored:', eventId);
          return new Response(JSON.stringify({ status: 'duplicate_event' }), {
            status: 200, headers: jsonHeaders
          });
        }
        console.error('Failed to record webhook_event:', replayError);
      }
    }

    if (event !== 'payment.refunded') {
      return new Response(JSON.stringify({ status: 'ignored', event }), {
        status: 200, headers: jsonHeaders
      });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      console.error('No payment entity in refund webhook payload');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400, headers: jsonHeaders
      });
    }

    const razorpayOrderId = payment.order_id;
    if (!razorpayOrderId) {
      console.error('Missing order_id in refund webhook');
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400, headers: jsonHeaders
      });
    }

    // Look up the payment record
    const { data: paymentRecord, error: lookupError } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, status, user_id, course_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (lookupError || !paymentRecord) {
      console.error('Payment record not found for order:', razorpayOrderId, lookupError);
      return new Response(JSON.stringify({ error: 'Payment record not found' }), {
        status: 404, headers: jsonHeaders
      });
    }

    // Idempotency: skip if already refunded
    if (paymentRecord.status === 'refunded') {
      console.log('Refund already processed for order:', razorpayOrderId);
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        status: 200, headers: jsonHeaders
      });
    }

    // Update payment status to refunded
    const { error: updatePaymentError } = await supabaseAdmin
      .from('razorpay_payments')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('razorpay_order_id', razorpayOrderId);

    if (updatePaymentError) {
      console.error('Failed to update payment to refunded:', updatePaymentError);
    } else {
      console.log('Payment marked as refunded:', razorpayOrderId);
    }

    // Deactivate enrollment
    const { error: enrollError } = await supabaseAdmin
      .from('enrollments')
      .update({ status: 'refunded' })
      .eq('user_id', paymentRecord.user_id)
      .eq('course_id', paymentRecord.course_id)
      .eq('status', 'active');

    if (enrollError) {
      console.error('Failed to deactivate enrollment:', enrollError);
    } else {
      console.log('Enrollment deactivated for user:', paymentRecord.user_id, 'course:', paymentRecord.course_id);
      // Forensic trail for enrollment revocation via refund.
      await supabaseAdmin.from('audit_log').insert({
        user_id: paymentRecord.user_id,
        action: 'refund_enrollment_revoked',
        table_name: 'enrollments',
        record_count: 1,
        metadata: {
          razorpay_order_id: razorpayOrderId,
          course_id: paymentRecord.course_id,
        },
      }).then(({ error }) => {
        if (error) console.error('Failed to write refund audit log:', error);
      });
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200, headers: jsonHeaders
    });

  } catch (error) {
    console.error('Refund webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: jsonHeaders
    });
  }
});
