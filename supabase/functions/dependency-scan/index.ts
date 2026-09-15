import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type PackageInput = { name: string; version: string };

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  published?: string;
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string; cwe_ids?: string[] };
  references?: Array<{ type: string; url: string }>;
}

interface Finding {
  id: string;
  package: string;
  version: string;
  summary: string;
  severity: string;
  aliases: string[];
  url: string;
}

function normalizeSeverity(v: OsvVuln): string {
  const dbSev = v.database_specific?.severity?.toUpperCase();
  if (dbSev) return dbSev;
  const cvss = v.severity?.find((s) => s.type?.startsWith("CVSS"))?.score;
  if (!cvss) return "UNKNOWN";
  const m = cvss.match(/CVSS:[^/]+\/.*?(?:\/|$)/);
  if (!m) return "UNKNOWN";
  // Simple heuristic; if a numeric base score is present as trailing "/X.Y"
  const num = parseFloat(cvss.split("/").pop() || "");
  if (!isNaN(num)) {
    if (num >= 9) return "CRITICAL";
    if (num >= 7) return "HIGH";
    if (num >= 4) return "MODERATE";
    if (num > 0) return "LOW";
  }
  return "UNKNOWN";
}

function stripSemverPrefix(v: string): string {
  return v.replace(/^[\^~>=<]+/, "").trim();
}

async function queryOsvBatch(packages: PackageInput[]): Promise<Array<{ vulns?: Array<{ id: string }> }>> {
  const queries = packages.map((p) => ({
    package: { name: p.name, ecosystem: "npm" },
    version: stripSemverPrefix(p.version),
  }));
  const res = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries }),
  });
  if (!res.ok) {
    throw new Error(`osv.dev batch query failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results || [];
}

async function fetchVulnDetail(id: string): Promise<OsvVuln | null> {
  try {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchAllDetails(ids: string[]): Promise<Map<string, OsvVuln>> {
  const unique = Array.from(new Set(ids));
  const out = new Map<string, OsvVuln>();
  // Simple concurrency limit of 8
  const chunkSize = 8;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(fetchVulnDetail));
    chunk.forEach((id, idx) => {
      const detail = results[idx];
      if (detail) out.set(id, detail);
    });
  }
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check via has_role RPC
    const { data: isAdmin, error: roleErr } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 10 scans / hour / admin
    const { data: allowed } = await serviceClient.rpc("check_rate_limit", {
      _bucket: "dependency_scan",
      _user_id: user.id,
      _max: 10,
      _window_seconds: 3600,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const packages: PackageInput[] = Array.isArray(body?.packages) ? body.packages : [];
    if (packages.length === 0) {
      return new Response(JSON.stringify({ error: "packages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (packages.length > 1000) {
      return new Response(JSON.stringify({ error: "Too many packages (max 1000)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate shape
    const clean: PackageInput[] = [];
    for (const p of packages) {
      if (!p || typeof p.name !== "string" || typeof p.version !== "string") continue;
      if (p.name.length > 214 || p.version.length > 64) continue;
      clean.push({ name: p.name, version: p.version });
    }

    const batchResults = await queryOsvBatch(clean);
    const idToPackages: Array<{ pkg: PackageInput; id: string }> = [];
    batchResults.forEach((r, idx) => {
      const pkg = clean[idx];
      (r?.vulns || []).forEach((v) => idToPackages.push({ pkg, id: v.id }));
    });

    const details = await fetchAllDetails(idToPackages.map((x) => x.id));

    const findings: Finding[] = idToPackages.map(({ pkg, id }) => {
      const d = details.get(id);
      return {
        id,
        package: pkg.name,
        version: pkg.version,
        summary: d?.summary || d?.details?.slice(0, 200) || id,
        severity: d ? normalizeSeverity(d) : "UNKNOWN",
        aliases: d?.aliases || [],
        url: d?.references?.[0]?.url || `https://osv.dev/vulnerability/${id}`,
      };
    });

    // Load previous report for diff
    const { data: prev } = await serviceClient
      .from("dependency_scan_reports")
      .select("id, created_at, vulnerability_count, package_count, findings")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Insert current
    const { data: inserted, error: insertErr } = await serviceClient
      .from("dependency_scan_reports")
      .insert({
        scanned_by: user.id,
        package_count: clean.length,
        vulnerability_count: findings.length,
        findings,
        packages: clean,
      })
      .select("id, created_at, vulnerability_count, package_count")
      .single();

    if (insertErr) {
      console.error("insert error", insertErr);
      return new Response(JSON.stringify({ error: "Failed to save report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Diff by finding id + package
    const keyOf = (f: { id: string; package: string }) => `${f.package}::${f.id}`;
    const currentKeys = new Set(findings.map(keyOf));
    const prevFindings: Finding[] = Array.isArray(prev?.findings) ? (prev!.findings as Finding[]) : [];
    const prevKeys = new Set(prevFindings.map(keyOf));
    const added = findings.filter((f) => !prevKeys.has(keyOf(f)));
    const resolved = prevFindings.filter((f) => !currentKeys.has(keyOf(f)));
    const unchanged = findings.filter((f) => prevKeys.has(keyOf(f)));

    return new Response(
      JSON.stringify({
        current: {
          id: inserted.id,
          created_at: inserted.created_at,
          package_count: clean.length,
          vulnerability_count: findings.length,
          findings,
        },
        previous: prev
          ? {
              id: prev.id,
              created_at: prev.created_at,
              vulnerability_count: prev.vulnerability_count,
              package_count: prev.package_count,
            }
          : null,
        diff: { added, resolved, unchanged_count: unchanged.length },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("dependency-scan error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});