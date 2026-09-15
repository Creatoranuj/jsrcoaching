import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { razorpayAuthHeader, razorpayFetchWithRetry } from "../_shared/razorpayFetch.ts";

// Rate limiting: Postgres-backed via `public.check_rate_limit` so it works
// across Supabase edge-runtime isolates (in-memory Map didn't — each isolate
// saw its own counter, effectively giving 5×N reqs/min per user).
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5;

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

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub as string } : null;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Service-role client (also used by the Postgres rate-limit check so
    // counters are shared across edge-runtime isolates).
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Postgres-backed rate limit (multi-isolate safe).
    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'create-razorpay-order',
      _user_id: user.id,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      // Fail-closed: rate limiter unavailability must NOT open a bypass.
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
    } else if (rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { course_id, idempotency_key } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Guard: mode-mismatched keys create orders that Razorpay Checkout then
    // rejects at `payment_authentication` with description="undefined" —
    // the exact bug users kept hitting. Fail fast with a clear message so
    // ops knows to fix the Supabase secret, instead of the customer eating
    // the confusing error mid-checkout.
    const keyIsTest = RAZORPAY_KEY_ID.startsWith('rzp_test_');
    const keyIsLive = RAZORPAY_KEY_ID.startsWith('rzp_live_');
    if (!keyIsTest && !keyIsLive) {
      console.error('[razorpay] RAZORPAY_KEY_ID has unexpected prefix', {
        prefix: RAZORPAY_KEY_ID.slice(0, 8),
      });
      return new Response(JSON.stringify({
        error: 'Payment gateway is misconfigured. Please contact support.',
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Idempotency: if a pending order already exists for this
    // (user, course, idempotency_key) tuple, return it instead of creating
    // a new Razorpay order. Prevents duplicate Razorpay orders + duplicate
    // DB rows when the user double-taps "Pay" or retries after a flaky
    // network. Quietly logs a payment_event for observability.
    // The row we finally insert must not collide with the stale row on the
    // UNIQUE (user_id, course_id, idempotency_key) constraint when we decide
    // NOT to reuse it — that collision surfaced as "Could not initialise
    // payment. Please retry." after a live↔test key switch.
    let effectiveIdemKey: string | null =
      idempotency_key && typeof idempotency_key === 'string' ? idempotency_key : null;

    if (idempotency_key && typeof idempotency_key === 'string') {
      const { data: existing } = await supabaseAdmin
        .from('razorpay_payments')
        .select('razorpay_order_id, amount, currency, status, created_at')
        .eq('user_id', user.id)
        .eq('course_id', Number(course_id))
        .eq('idempotency_key', idempotency_key)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && existing.status === 'pending' && existing.razorpay_order_id) {
        const createdAt = existing.created_at ? Date.parse(existing.created_at) : 0;
        const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000;

        if (!isFresh) {
          effectiveIdemKey = `${idempotency_key}:r${Date.now().toString(36)}`;
          await supabaseAdmin.from('payment_events').insert({
            user_id: user.id, course_id: Number(course_id),
            event_type: 'order_reuse_skipped',
            razorpay_order_id: existing.razorpay_order_id,
            idempotency_key,
            metadata: { reason: 'stale_pending_order' },
          });
        } else {
          // Key-rotation safety: after switching live ↔ test secrets, a cached
          // APK/session may still send the old idempotency key. Never pair a
          // stale order_id from the old Razorpay account with the newly active
          // key_id — checkout treats that as the wrong mode. Verify the saved
          // order is visible with the *current* Supabase Razorpay secret before
          // reusing it; otherwise create a fresh order under the current key.
          const currentKeyOrder = await razorpayFetchWithRetry(
            `https://api.razorpay.com/v1/orders/${encodeURIComponent(existing.razorpay_order_id)}`,
            { headers: { Authorization: razorpayAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) }, attempts: 2 },
          );

          if (currentKeyOrder.retryable) {
            return new Response(JSON.stringify({
              error: 'Payment server is busy. Please try again.',
              code: 'RAZORPAY_ORDER_REUSE_CHECK_RETRYABLE',
            }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          if (!currentKeyOrder.ok) {
            effectiveIdemKey = `${idempotency_key}:r${Date.now().toString(36)}`;
            await supabaseAdmin.from('payment_events').insert({
              user_id: user.id, course_id: Number(course_id),
              event_type: 'order_reuse_skipped',
              razorpay_order_id: existing.razorpay_order_id,
              idempotency_key,
              metadata: {
                reason: 'order_not_visible_with_current_key',
                active_mode: keyIsLive ? 'live' : 'test',
                status: currentKeyOrder.status ?? null,
              },
            });
          } else {
            // Fetch course title for the response shape.
            const { data: c } = await supabase
              .from('courses').select('title').eq('id', course_id).single();
            await supabaseAdmin.from('payment_events').insert({
              user_id: user.id, course_id: Number(course_id),
              event_type: 'order_reused',
              razorpay_order_id: existing.razorpay_order_id,
              idempotency_key,
              metadata: { active_mode: keyIsLive ? 'live' : 'test' },
            });
            return new Response(JSON.stringify({
              order_id: existing.razorpay_order_id,
              amount: Math.round(Number(existing.amount) * 100),
              currency: existing.currency || 'INR',
              key_id: RAZORPAY_KEY_ID,
              mode: keyIsLive ? 'live' : 'test',
              course_title: c?.title ?? '',
              reused: true,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      }
    }

    // Fetch course price from DB (server-side — ignores client input)
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price')
      .eq('id', course_id)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: 'Course not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!course.price || course.price <= 0) {
      return new Response(JSON.stringify({ error: 'This course is free. Use free enrollment.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[razorpay] order mode', {
      mode: keyIsLive ? 'live' : 'test',
      key_prefix: RAZORPAY_KEY_ID.slice(0, 12),
      user_id: user.id,
      course_id,
    });


    const amountInPaise = Math.round(course.price * 100);

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `course_${course_id}_user_${user.id.slice(0, 8)}`,
        notes: {
          course_id: course_id.toString(),
          user_id: user.id,
          course_title: course.title,
        }
      })
    });

    if (!razorpayResponse.ok) {
      const errText = await razorpayResponse.text();
      console.error('[razorpay] api error', {
        status: razorpayResponse.status,
        body: errText.slice(0, 500),
        user_id: user.id,
        course_id,
      });
      await supabaseAdmin.from('payment_events').insert({
        user_id: user.id, course_id: Number(course_id),
        event_type: 'order_failed',
        idempotency_key: idempotency_key ?? null,
        metadata: { stage: 'razorpay_api', status: razorpayResponse.status, body: errText.slice(0, 500) },
      });
      return new Response(JSON.stringify({
        error: 'Failed to create Razorpay order',
        code: 'RAZORPAY_API_ERROR',
        status: razorpayResponse.status,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const razorpayOrder = await razorpayResponse.json();

    // supabaseAdmin already created above for rate-limit check.

    // SEC: previously this insert was fire-and-forget. If it silently failed
    // (constraint violation, transient DB error) the user could still pay on
    // Razorpay and the webhook would then arrive with no DB row to validate
    // amount against. We now fail the order creation hard so the user never
    // pays for an order we can't reconcile.
    const insertPending = (idem: string | null) =>
      supabaseAdmin.from('razorpay_payments').insert({
        user_id: user.id,
        course_id: course_id,
        razorpay_order_id: razorpayOrder.id,
        amount: course.price,
        currency: 'INR',
        status: 'pending',
        idempotency_key: idem,
      });

    let { error: insertErr } = await insertPending(effectiveIdemKey);
    // A 23505 here means an older row already owns this
    // (user_id, course_id, idempotency_key) tuple — typically a stale pending
    // order from a previous key/mode. The Razorpay order is already created,
    // so retry once with a uniquified key instead of failing the customer.
    if (insertErr && (insertErr as { code?: string }).code === '23505' && effectiveIdemKey) {
      const retryKey = `${effectiveIdemKey}:r${Date.now().toString(36)}`;
      console.warn('[razorpay] idempotency key collision, retrying with suffixed key', {
        user_id: user.id, course_id,
      });
      ({ error: insertErr } = await insertPending(retryKey));
      if (!insertErr) effectiveIdemKey = retryKey;
    }
    if (insertErr) {
      console.error('[razorpay] failed to record pending payment, aborting order', {
        user_id: user.id,
        course_id,
        db_code: insertErr.code,
        db_message: insertErr.message,
        db_details: insertErr.details,
      });
      await supabaseAdmin.from('payment_events').insert({
        user_id: user.id, course_id: Number(course_id),
        event_type: 'order_failed',
        razorpay_order_id: razorpayOrder.id,
        idempotency_key: idempotency_key ?? null,
        metadata: { stage: 'db_insert', code: insertErr.code, message: insertErr.message },
      });
      return new Response(JSON.stringify({
        error: 'Could not initialise payment. Please retry.',
        code: 'DB_INSERT_FAILED',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await supabaseAdmin.from('payment_events').insert({
      user_id: user.id, course_id: Number(course_id),
      event_type: 'order_created',
      razorpay_order_id: razorpayOrder.id,
      idempotency_key: idempotency_key ?? null,
      metadata: { amount_paise: amountInPaise },
    });

    return new Response(JSON.stringify({
      order_id: razorpayOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      key_id: RAZORPAY_KEY_ID,
      // Non-secret: lets the client surface a visible TEST MODE badge so
      // test/live confusion can never reach a real customer silently.
      mode: keyIsLive ? 'live' : 'test',
      course_title: course.title,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const err = error as { message?: string; stack?: string };
    console.error('[razorpay] unhandled error', {
      message: err?.message,
      stack: err?.stack?.slice(0, 500),
    });
    return new Response(JSON.stringify({
      error: 'Internal server error',
      code: 'INTERNAL',
      detail: err?.message?.slice(0, 200),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
