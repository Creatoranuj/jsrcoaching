import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

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

    const { plan_slug } = await req.json();
    if (!plan_slug || typeof plan_slug !== 'string') {
      return new Response(JSON.stringify({ error: 'plan_slug is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: plan, error: planErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('slug, trial_days')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .maybeSingle();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!plan.trial_days || plan.trial_days <= 0) {
      return new Response(JSON.stringify({ error: 'This plan has no trial' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Block users who have already had any subscription (trial or paid)
    const { data: existing } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: 'Free trial is only available for new subscribers' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const trialEndsAt = new Date(Date.now() + plan.trial_days * 24 * 60 * 60 * 1000);

    const { data: sub, error: insErr } = await supabaseAdmin
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        plan_slug: plan.slug,
        status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        current_period_end: trialEndsAt.toISOString(),
      })
      .select('id, plan_slug, status, trial_ends_at')
      .single();

    if (insErr) {
      console.error('Trial insert error:', insErr);
      return new Response(JSON.stringify({ error: 'Could not start trial' }), {
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
