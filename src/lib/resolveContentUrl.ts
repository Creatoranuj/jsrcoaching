import { supabase } from "../integrations/supabase/client";

/**
 * The `content` bucket is a mixed bucket:
 *   - `hero-banners/*`, `thumbnails/*`, `chapter-icons/*`  → anon-readable
 *   - `lessons/*`, `materials/*`, `notes/*`, root quiz images → enrollment-gated
 *
 * Legacy rows in `lessons.class_pdf_url`, `materials.file_url`, `notes.pdf_url`,
 * `questions.image_url` may store either:
 *   - a permanent `/object/public/content/<path>` URL from when the bucket was
 *     fully public, or
 *   - a new `storage://content/<path>` URI (bucket-agnostic).
 *
 * `resolveContentUrl` turns either form into a browser-loadable URL. Public
 * thumbnail/banner/icon folders use permanent public CDN URLs so course cards
 * load fast without signing. Gated lesson/material files still use short-lived
 * signed URLs. External URLs (Notion, Drive, external CDNs, or objects in a
 * different bucket) are returned untouched.
 *
 * Observability: every failure is logged with `[resolveContentUrl]` prefix
 * AND best-effort mirrored to `security_events` so a missing storage policy
 * shows up in the admin dashboard within seconds. Failures are throttled to
 * one report per (path, code) per session to avoid log storms.
 */
const BUCKET = "content";
const SIGNED_TTL_SECONDS = 60 * 60; // 1h

/**
 * Presentation-only folders in the `content` bucket. These hold course cards,
 * thumbnails, hero banners and chapter icons — no gated study material — and
 * the bucket serves them over the public CDN. Signing them is both unnecessary
 * and harmful: signing requires a session, so signed-out visitors (and any
 * transient signing failure) fell back to the red PDF placeholder. Return a
 * permanent public URL for these paths instead; gated folders still get signed.
 */
const PUBLIC_FOLDERS = ["courses", "thumbnails", "hero-banners", "chapter-icons", "banners"];

function isPublicPath(path: string): boolean {
  return PUBLIC_FOLDERS.includes(path.split("/")[0]);
}

function publicUrlFor(path: string): string | null {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}


/**
 * Only URLs belonging to THIS Supabase project may be re-signed. Rows that
 * survived the migration from a previous project still carry that project's
 * host; signing those paths here always fails ("object does not exist")
 * because the file never existed in this bucket. Treat them as external.
 */
const PROJECT_REF: string | null = (() => {
  const envUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL) ||
    "https://wegamscqtvqhxowlskfm.supabase.co";
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(envUrl);
  return m ? m[1] : null;
})();

export function extractContentPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const storageMatch = /^storage:\/\/content\/(.+)$/i.exec(url);
  if (storageMatch) return decodeURIComponent(storageMatch[1]);
  const hostMatch = /^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\/storage\//i.exec(url);
  if (!hostMatch) return null;
  // Foreign-project URL (stale row from a previous Supabase project) — never
  // attempt to sign it against our bucket.
  if (PROJECT_REF && hostMatch[1].toLowerCase() !== PROJECT_REF.toLowerCase()) return null;
  const httpMatch = /\/content\/([^?#]+)/i.exec(url);
  return httpMatch ? decodeURIComponent(httpMatch[1]) : null;
}

/**
 * A storage error that means "the file isn't there" — expected after a project
 * migration where DB rows survived but objects did not. Supabase phrases this
 * as "Either the object does not exist or you do not have access to it".
 */
function classifyStorageError(message: string | null | undefined): "missing_object" | "sign_failed" {
  return /not\s*found|does not exist|do not have access to it|404/i.test(message ?? "")
    ? "missing_object"
    : "sign_failed";
}

// Session-scoped dedupe so a broken policy on one row doesn't flood logs.
const reportedFailures = new Set<string>();

async function reportFailure(
  code: "invalid_path" | "sign_failed" | "empty_signed_url" | "missing_object",
  path: string | null,
  detail?: string
) {
  const key = `${code}:${path ?? "null"}`;
  if (reportedFailures.has(key)) return;
  reportedFailures.add(key);

  // A `missing_object` is an expected, non-actionable state after a Supabase
  // project migration where DB rows survived but storage files did not — the
  // UI falls back to a branded placeholder. Log it quietly (once per path)
  // instead of warning, so real policy/signing failures stay visible.
  if (code === "missing_object") {
    console.info("[resolveContentUrl] missing object (placeholder used)", { path });
    return;
  }

  // Client-side: structured warn so it appears in browser console + any
  // remote log aggregator (Sentry, LogRocket) that hooks console.
  console.warn("[resolveContentUrl] failure", { code, path, detail });

  // Server-side: best-effort insert into security_events. Auth is optional
  // — if it fails (anon user, RLS denies), we silently drop; the console
  // warn is still the primary signal.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return;
    await supabase.from("security_events").insert({
      event_type: "content_url_resolve_failed",
      payload: {
        code,
        path,
        detail: detail ?? null,
        location: typeof window !== "undefined" ? window.location.pathname : null,
      },
    } as never);
  } catch {
    /* non-fatal */
  }
}

export async function resolveContentUrl(
  url: string | null | undefined,
  ttlSeconds: number = SIGNED_TTL_SECONDS
): Promise<string | null> {
  if (!url) return null;
  const path = extractContentPath(url);
  if (!path) return url; // Not a `content` bucket URL — pass through.

  // Presentation images: permanent public CDN URL, no session required.
  if (isPublicPath(path)) return publicUrlFor(path);





  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error) {
    void reportFailure(classifyStorageError(error.message), path, error.message);
    return null;
  }
  if (!data?.signedUrl) {
    void reportFailure("empty_signed_url", path);
    return null;
  }
  return data.signedUrl;
}

/**
 * Batched variant. Groups all gated `content` bucket paths into a single
 * `createSignedUrls` (plural) storage RPC, cutting N round-trips to 1 for
 * list views (materials, notes indexes). Non-content URLs and public-folder
 * URLs pass through synchronously — same semantics as `resolveContentUrl`.
 *
 * Returns an array in the SAME order as the input. Duplicate paths are
 * de-duped before signing and fanned back out to every matching slot.
 */
export async function resolveContentUrls(
  urls: Array<string | null | undefined>,
  ttlSeconds: number = SIGNED_TTL_SECONDS
): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(urls.length).fill(null);
  const gatedIndexByPath = new Map<string, number[]>();
  const pathsToSign: string[] = [];

  urls.forEach((url, i) => {
    if (!url) return;
    const path = extractContentPath(url);
    if (!path) { out[i] = url; return; }
    if (isPublicPath(path)) { out[i] = publicUrlFor(path); return; }



    const existing = gatedIndexByPath.get(path);
    if (existing) { existing.push(i); return; }
    gatedIndexByPath.set(path, [i]);
    pathsToSign.push(path);
  });

  if (pathsToSign.length === 0) return out;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(pathsToSign, ttlSeconds);

  if (error || !data) {
    void reportFailure(classifyStorageError(error?.message), pathsToSign[0] ?? null, error?.message);
    return out;
  }

  data.forEach((entry: { path: string | null; signedUrl: string; error?: string | null }) => {
    const path = entry.path;
    if (!path) return;
    const targets = gatedIndexByPath.get(path);
    if (!targets) return;
    const signed = entry.signedUrl || null;
    if (entry.error) void reportFailure(classifyStorageError(entry.error), path, entry.error);
    else if (!signed) void reportFailure("empty_signed_url", path);
    targets.forEach((i) => { out[i] = signed; });
  });

  return out;
}

