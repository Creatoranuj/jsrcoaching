/**
 * Canonical list of hosts the `pdf-proxy` edge function is allowed to relay.
 *
 * This list used to exist twice — once in `linkSources.ts` (13 patterns) and
 * once in `supabase/functions/pdf-proxy/index.ts` (26 patterns) — and the two
 * had drifted apart in both directions:
 *
 *  - NCERT/CBSE, Notion attachments, b-cdn, statically and Dropbox were served
 *    fine by the proxy but the client told the student "this link can't be
 *    read in the app".
 *  - `storage.googleapis.com` was advertised as relayable on the client and
 *    then rejected server-side — a hard failure with no fallback.
 *
 * The edge function runs on Deno and cannot import from `src/`, so it keeps a
 * literal copy. `src/test/pdfHostParity.test.ts` parses that copy and fails
 * the build whenever the two lists diverge again.
 */
export const TRUSTED_PDF_HOST_PATTERNS: RegExp[] = [
  /(^|\.)cdn\.jsdelivr\.net$/i,
  /(^|\.)raw\.githubusercontent\.com$/i,
  /(^|\.)blob\.core\.windows\.net$/i,
  /(^|\.)github-storages-cdn\.vercel\.app$/i,
  /(^|\.)storage-safarenglishka-recording\.vercel\.app$/i,
  /(^|\.)storage-naveenbharat-recording\.vercel\.app$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)archive\.org$/i,
  // NCERT / CBSE official textbook + exemplar hosts.
  /(^|\.)ncert\.nic\.in$/i,
  /(^|\.)ncertbooks\.nic\.in$/i,
  /(^|\.)epathshala\.nic\.in$/i,
  /(^|\.)cbseacademic\.nic\.in$/i,
  /(^|\.)cbse\.gov\.in$/i,
  /(^|\.)cbse\.nic\.in$/i,
  // Notion pages + the signed S3 hosts their file attachments live on.
  /(^|\.)notion\.so$/i,
  /(^|\.)notion\.site$/i,
  /(^|\.)notion-static\.com$/i,
  /^prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com$/i,
  // Generic public CDNs commonly used for lecture notes.
  /(^|\.)unpkg\.com$/i,
  /(^|\.)cdn\.statically\.io$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)r2\.dev$/i,
  /(^|\.)b-cdn\.net$/i,
  /(^|\.)githubusercontent\.com$/i,
  /(^|\.)dropboxusercontent\.com$/i,
  /(^|\.)storage\.googleapis\.com$/i,
  /(^|\.)drive\.usercontent\.google\.com$/i,
  /(^|\.)supabase\.co$/i,
];

/**
 * Google Drive / Docs and Notion pages have their own dedicated proxy routes
 * (`kind=drive`, the `/export` rewrite, NotionPageRenderer), so the client
 * treats them as reachable even though the generic URL allow-list above does
 * not list them.
 */
const DEDICATED_ROUTE_HOSTS: RegExp[] = [
  /(^|\.)drive\.google\.com$/i,
  /(^|\.)docs\.google\.com$/i,
  /^prod-recordings\.vedantu\.com$/i,
];

export function isTrustedPdfHost(hostname: string): boolean {
  return (
    TRUSTED_PDF_HOST_PATTERNS.some((re) => re.test(hostname)) ||
    DEDICATED_ROUTE_HOSTS.some((re) => re.test(hostname))
  );
}

/** True when this URL can be relayed through pdf-proxy (https only). */
export function isRelayableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return isTrustedPdfHost(u.hostname);
  } catch {
    return false;
  }
}
