// Shared JWT + role helpers for edge functions.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthOk = { ok: true; userId: string; token: string };
export type AuthErr = { ok: false; response: Response };

export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthOk | AuthErr> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  const token = authHeader.slice(7).trim();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // Prefer local JWT verification via signing keys (getClaims) — avoids the
  // stale-session 401s that `getUser(token)` returns when the Auth server
  // has rotated signing keys but the client session is still valid.
  // Fall back to getUser() for older supabase-js versions without getClaims.
  let userId: string | undefined;
  try {
    // @ts-expect-error - getClaims exists on supabase-js >= 2.45
    if (typeof client.auth.getClaims === "function") {
      // @ts-expect-error - getClaims exists on supabase-js >= 2.45
      const { data, error } = await client.auth.getClaims(token);
      if (!error && data?.claims?.sub) userId = data.claims.sub as string;
    }
  } catch { /* fall through */ }
  if (!userId) {
    const { data, error } = await client.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }
  if (!userId) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true, userId, token };
}

export async function requireRole(
  req: Request,
  corsHeaders: Record<string, string>,
  roles: Array<"admin" | "teacher" | "student">,
): Promise<AuthOk | AuthErr> {
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .in("role", roles);
  if (error || !data || data.length === 0) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return auth;
}
