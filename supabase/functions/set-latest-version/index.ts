// CI hook: records the version that was just released so the in-app update
// prompt knows what "latest" is.
//
// Auth (AUDIT 2026-09-19 — RELEASE_TOKEN → GitHub OIDC):
//   Preferred: `x-github-oidc-token` — a short-lived JWT minted by GitHub
//   Actions for the build-apk workflow. Verified against GitHub's public JWKS
//   (issuer https://token.actions.githubusercontent.com), then pinned to
//   THIS repository, THIS workflow file, a tag or main ref, and the version
//   being published must equal the tag being built. No shared secret to
//   rotate or leak; a forked repo or a different workflow cannot mint a token
//   that passes these checks.
//   Legacy: `x-release-token` compared constant-time against RELEASE_TOKEN
//   (kept for a manual/local publish; unset RELEASE_TOKEN to disable it).
//
// verify_jwt is off platform-wide, so these headers ARE the security boundary.
//
// It never touches force_update or the minimum supported version — a mandatory
// update stays a deliberate admin decision in /admin/app-update. It also never
// LOWERS latest_<platform>_version (a rebuild of an old tag cannot un-announce
// a newer release) unless the caller explicitly sends allow_downgrade: true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@5";
import { buildCorsHeaders } from "../_shared/cors.ts";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));

const DEFAULT_REPOSITORY = "Creatoranuj/jsrcoaching";
const DEFAULT_WORKFLOW = "build-apk.yml";
const DEFAULT_AUDIENCE = "jsr-coaching-release";
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Segment-wise compare: -1 if a<b, 0 if equal, 1 if a>b ("1.10" > "1.9"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((s) => parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

type GitHubClaims = JWTPayload & {
  repository?: string;
  repository_owner?: string;
  workflow_ref?: string;
  ref?: string;
  ref_type?: string;
  event_name?: string;
  actor?: string;
  run_id?: string;
  sha?: string;
};

type AuthResult =
  | { ok: true; method: "github_oidc"; claims: GitHubClaims }
  | { ok: true; method: "release_token"; claims: null }
  | { ok: false; status: number; error: string };

async function verifyGitHubOidc(token: string): Promise<AuthResult> {
  const repository = Deno.env.get("RELEASE_OIDC_REPOSITORY") ?? DEFAULT_REPOSITORY;
  const workflow = Deno.env.get("RELEASE_OIDC_WORKFLOW") ?? DEFAULT_WORKFLOW;
  const audience = Deno.env.get("RELEASE_OIDC_AUDIENCE") ?? DEFAULT_AUDIENCE;

  let claims: GitHubClaims;
  try {
    const { payload } = await jwtVerify(token, GITHUB_JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience,
      // GitHub tokens live ~5 min; a little skew tolerance for runner clocks.
      clockTolerance: 60,
    });
    claims = payload as GitHubClaims;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[set-latest-version] OIDC verify failed:", msg);
    return { ok: false, status: 401, error: "OIDC_INVALID" };
  }

  if (claims.repository !== repository) {
    console.warn("[set-latest-version] OIDC wrong repository:", claims.repository);
    return { ok: false, status: 403, error: "OIDC_WRONG_REPOSITORY" };
  }
  const expectedWorkflowPrefix = `${repository}/.github/workflows/${workflow}@`;
  if (!claims.workflow_ref || !claims.workflow_ref.startsWith(expectedWorkflowPrefix)) {
    console.warn("[set-latest-version] OIDC wrong workflow:", claims.workflow_ref);
    return { ok: false, status: 403, error: "OIDC_WRONG_WORKFLOW" };
  }
  const ref = claims.ref ?? "";
  const isTag = ref.startsWith("refs/tags/");
  const isMain = ref === "refs/heads/main" || ref === "refs/heads/master";
  if (!isTag && !isMain) {
    console.warn("[set-latest-version] OIDC ref not releasable:", ref);
    return { ok: false, status: 403, error: "OIDC_REF_NOT_RELEASABLE" };
  }
  return { ok: true, method: "github_oidc", claims };
}

function verifyReleaseToken(provided: string): AuthResult {
  const expected = Deno.env.get("RELEASE_TOKEN");
  if (!expected) return { ok: false, status: 401, error: "Unauthorized" };
  if (!timingSafeEqual(provided, expected)) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, method: "release_token", claims: null };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    // ---- Authenticate the caller -------------------------------------------
    const oidc = req.headers.get("x-github-oidc-token")?.trim() ?? "";
    const legacy = req.headers.get("x-release-token") ?? "";
    let auth: AuthResult;
    if (oidc) auth = await verifyGitHubOidc(oidc);
    else if (legacy) auth = verifyReleaseToken(legacy);
    else auth = { ok: false, status: 401, error: "Unauthorized" };
    if (!auth.ok) return json(auth.status, { error: auth.error });

    // ---- Validate input ----------------------------------------------------
    let body: { version?: unknown; platform?: unknown; notes?: unknown; allow_downgrade?: unknown } = {};
    try { body = await req.json(); } catch { /* empty */ }
    const version = typeof body.version === "string" ? body.version.trim().replace(/^v/i, "") : "";
    if (!VERSION_RE.test(version)) return json(400, { error: "INVALID_VERSION" });
    const platform = body.platform === "ios" ? "ios" : "android";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : null;
    const allowDowngrade = body.allow_downgrade === true;

    // OIDC callers may only publish the version of the tag they are building.
    // (A main-branch build carries no tag, so it is bound by the monotonic
    // guard below instead.)
    if (auth.method === "github_oidc") {
      const ref = auth.claims.ref ?? "";
      if (ref.startsWith("refs/tags/")) {
        const tagVersion = ref.slice("refs/tags/".length).replace(/^v/i, "");
        if (VERSION_RE.test(tagVersion) && tagVersion !== version) {
          console.warn("[set-latest-version] version/tag mismatch:", { tagVersion, version });
          return json(403, { error: "VERSION_TAG_MISMATCH", tag: tagVersion });
        }
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const column = platform === "ios" ? "latest_ios_version" : "latest_android_version";

    // ---- Monotonic guard: never silently lower "latest" --------------------
    const { data: current, error: readErr } = await admin
      .from("app_config")
      .select(column)
      .eq("id", 1)
      .maybeSingle();
    if (readErr) throw readErr;
    const existing = (current as Record<string, string | null> | null)?.[column] ?? null;
    if (existing && VERSION_RE.test(existing) && compareVersions(version, existing) < 0 && !allowDowngrade) {
      console.log("[set-latest-version] skipped downgrade", { platform, version, existing, method: auth.method });
      return json(200, { ok: true, skipped: "older_than_current", platform, version, current: existing });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), [column]: version };
    if (notes) patch.update_notes = notes;

    const { error } = await admin.from("app_config").update(patch).eq("id", 1);
    if (error) throw error;

    console.log("[set-latest-version] published", {
      platform,
      version,
      previous: existing,
      method: auth.method,
      actor: auth.claims?.actor ?? null,
      run_id: auth.claims?.run_id ?? null,
      sha: auth.claims?.sha ?? null,
    });

    return json(200, { ok: true, platform, version, previous: existing, method: auth.method });
  } catch (e) {
    console.error("[set-latest-version]", e);
    return json(500, { error: "INTERNAL" });
  }
});
