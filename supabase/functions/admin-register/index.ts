import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'

/**
 * Admin registration — the ONLY path that can create an account with the
 * `admin` role. Gated by the ADMIN_PASSWORD secret (the "admin code").
 * Students never get here: every normal signup gets `student` via the
 * handle_new_user_role trigger.
 */
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  try {
    const adminCodeSecret = Deno.env.get('ADMIN_PASSWORD')
    if (!adminCodeSecret) return json({ success: false, error: 'Admin registration is not configured' }, 503)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON body' }, 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 120) : ''
    const adminCode = typeof body.admin_code === 'string' ? body.admin_code : ''

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      return json({ success: false, error: 'A valid email is required' }, 400)
    }
    if (password.length < 10) {
      return json({ success: false, error: 'Admin password must be at least 10 characters' }, 400)
    }
    if (!fullName) return json({ success: false, error: 'Full name is required' }, 400)

    // Constant-time-ish comparison of the admin code
    const enc = new TextEncoder()
    const a = enc.encode(adminCode)
    const b = enc.encode(adminCodeSecret)
    let diff = a.length ^ b.length
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (diff !== 0) {
      await supabaseAdmin.from('security_alerts').insert({
        alert_type: 'admin_register.bad_code',
        details: { email },
        source_ip: req.headers.get('x-forwarded-for'),
      })
      return json({ success: false, error: 'Invalid admin authorization code' }, 403)
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createErr || !created?.user) {
      return json({ success: false, error: createErr?.message ?? 'Could not create admin account' }, 400)
    }

    const userId = created.user.id

    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })

    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return json({ success: false, error: 'Could not assign admin role' }, 500)
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      actor_id: userId,
      action: 'admin.register',
      table_name: 'user_roles',
      record_count: 1,
      entity_type: 'user',
      entity_id: userId,
    })

    return json({ success: true, message: 'Admin account created' })
  } catch (error) {
    console.error('admin-register error:', error)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
