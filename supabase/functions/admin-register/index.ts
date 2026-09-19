import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { isRateLimitedByKey } from '../_shared/rateLimit.ts'

/**
 * Admin registration — the ONLY path that can create an account with the
 * `admin` role. Gated by the ADMIN_PASSWORD secret (the "admin code").
 * Students never get here: every normal signup gets `student` via the
 * handle_new_user_role trigger.
 *
 * AUDIT 2026-09-19 (defence in depth — a leaked admin code used to mean
 * unlimited admin accounts, silently):
 *   • ADMIN_REGISTER_LOCKED=true   → endpoint closed (403). Set this once the
 *                                    real admins exist; flip off only to onboard.
 *   • ADMIN_ALLOWED_EMAILS         → comma-separated allowlist of exact emails
 *                                    and/or "@domain.com" suffixes. Unset = any
 *                                    email (legacy behaviour).
 *   • ADMIN_MAX_ACCOUNTS (def. 5)  → hard cap on rows with role='admin'.
 *   • Global throttle (20 / 15 min across ALL IPs) on top of the per-IP one,
 *     so a botnet cannot spread a brute force across addresses.
 *   • Every outcome is written to security_alerts; successes also to audit_log
 *     (the previous audit insert used columns that did not exist and failed
 *     silently — admin creation was effectively unaudited).
 *   • GoTrue error text is no longer echoed (it leaked "already registered").
 */

const PER_IP_MAX = 5
const GLOBAL_MAX = 20
const WINDOW_SECONDS = 900
const DEFAULT_MAX_ADMINS = 5

function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function emailAllowed(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  return allowlist.some((entry) =>
    entry.startsWith('@') ? email.endsWith(entry) : email === entry,
  )
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

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

    const callerIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const sourceIp = req.headers.get('x-forwarded-for')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const alert = async (alertType: string, details: Record<string, unknown>) => {
      const { error } = await supabaseAdmin
        .from('security_alerts')
        .insert({ alert_type: alertType, details, source_ip: sourceIp })
      if (error) console.error('[admin-register] security_alerts insert failed:', error.message)
    }

    // Bootstrap lock: once real admins exist, close the door entirely.
    if ((Deno.env.get('ADMIN_REGISTER_LOCKED') ?? '').trim().toLowerCase() === 'true') {
      await alert('admin_register.locked_attempt', { ip: callerIp })
      return json({ success: false, error: 'Admin registration is closed' }, 403)
    }

    // AUDIT 2026-09-17: per-IP throttle (5 / 15 min). AUDIT 2026-09-19: plus a
    // global bucket so the brute force cannot be spread across many IPs.
    if (await isRateLimitedByKey({ bucket: 'admin_register', identifier: callerIp, max: PER_IP_MAX, windowSeconds: WINDOW_SECONDS })) {
      return json({ success: false, error: 'Too many attempts. Please try again later.' }, 429)
    }
    if (await isRateLimitedByKey({ bucket: 'admin_register_global', identifier: 'all', max: GLOBAL_MAX, windowSeconds: WINDOW_SECONDS })) {
      await alert('admin_register.global_throttle', { ip: callerIp })
      return json({ success: false, error: 'Too many attempts. Please try again later.' }, 429)
    }

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

    if (diff !== 0) {
      await alert('admin_register.bad_code', { email })
      return json({ success: false, error: 'Invalid admin authorization code' }, 403)
    }

    // Email allowlist — a valid code alone is not enough for an unknown address.
    const allowlist = parseAllowlist(Deno.env.get('ADMIN_ALLOWED_EMAILS'))
    if (!emailAllowed(email, allowlist)) {
      await alert('admin_register.email_not_allowed', { email })
      // Same wording as bad_code so a code-holder cannot probe the allowlist.
      return json({ success: false, error: 'Invalid admin authorization code' }, 403)
    }

    // Hard cap on the number of admin accounts.
    const maxAdmins = parsePositiveInt(Deno.env.get('ADMIN_MAX_ACCOUNTS'), DEFAULT_MAX_ADMINS)
    const { count: adminCount, error: countErr } = await supabaseAdmin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin')
    if (countErr || adminCount === null) {
      console.error('[admin-register] admin count failed:', countErr?.message)
      return json({ success: false, error: 'Admin registration is temporarily unavailable' }, 503)
    }
    if (adminCount >= maxAdmins) {
      await alert('admin_register.cap_reached', { email, admin_count: adminCount, max: maxAdmins })
      return json({ success: false, error: 'Admin registration is closed' }, 403)
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createErr || !created?.user) {
      // Log the real reason server-side; never echo GoTrue's message (it
      // distinguishes "already registered" from other failures).
      console.error('[admin-register] createUser failed:', createErr?.message)
      await alert('admin_register.create_failed', { email, reason: createErr?.message ?? 'unknown' })
      return json({ success: false, error: 'Could not create admin account' }, 400)
    }

    const userId = created.user.id

    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })

    if (roleErr) {
      console.error('[admin-register] role insert failed:', roleErr.message)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      await alert('admin_register.role_failed', { email, user_id: userId })
      return json({ success: false, error: 'Could not assign admin role' }, 500)
    }

    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      actor_id: userId,
      action: 'admin.register',
      table_name: 'user_roles',
      record_count: 1,
      entity_type: 'user',
      entity_id: userId,
      metadata: { email, ip: callerIp, admin_count_after: adminCount + 1, max: maxAdmins },
    })
    if (auditErr) console.error('[admin-register] audit_log insert failed:', auditErr.message)

    await alert('admin_register.created', {
      email,
      user_id: userId,
      admin_count_after: adminCount + 1,
      max: maxAdmins,
    })

    return json({ success: true, message: 'Admin account created' })
  } catch (error) {
    console.error('admin-register error:', error)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
