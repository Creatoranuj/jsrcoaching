import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { requestPdfViaNativeHttp } from "../nativePdfHttp";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_HOST_RE = /storage-naveenbharat-recording\.vercel\.app/i;
const VIEW_ID_RE = /\/view\/([a-f0-9-]{20,})/i;

// External storage credentials moved server-side into the
// `resolve-storage-pdf` edge function. The client only sends a view_id +
// its own JWT; the edge function does the upstream calls with the
// server-held key. Do NOT reintroduce the raw upstream key here.

export function isNaveenStorageViewUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return STORAGE_HOST_RE.test(u.hostname) && VIEW_ID_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export function getNaveenStorageViewId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!STORAGE_HOST_RE.test(u.hostname)) return null;
    return u.pathname.match(VIEW_ID_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

function abortError(): Error {
  const err = new Error("Native storage request aborted");
  err.name = "AbortError";
  return err;
}

async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    }),
  ]);
}

async function fetchBlobViaNativeHttp(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const resp = await raceAbort(
      requestPdfViaNativeHttp(url, {
        method: "POST",
        signal,
        headers: { ...headers, "Content-Type": "application/json" },
        data: body,
      }),
      signal,
    );
    return resp;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return null;
  }
}

export async function fetchNaveenStoragePdf(url: string, signal?: AbortSignal): Promise<Blob> {
  const id = getNaveenStorageViewId(url);
  if (!id) throw new Error("Unsupported JSR COACHING storage link");

  // Route through our authenticated edge function. The upstream API key is
  // held server-side; this client only ever sends its own JWT + view_id.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Sign in required to open this document");

  // Read the project URL/anon key from the compiled Supabase client first —
  // `import.meta.env` is undefined inside the pdf.js worker / some Capacitor
  // bundles, which used to surface as "Supabase client not configured".
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ||
    "https://wegamscqtvqhxowlskfm.supabase.co";
  const anonKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (supabase as unknown as { supabaseKey?: string }).supabaseKey ||
    "";
  if (!supabaseUrl || !anonKey) throw new Error("Supabase client not configured");


  const endpoint = `${supabaseUrl}/functions/v1/resolve-storage-pdf`;
  const proxyHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
  const payload = { view_id: id };

  const nativeBlob = await fetchBlobViaNativeHttp(endpoint, proxyHeaders, payload, signal);
  if (nativeBlob) return nativeBlob;

  // Native APK must not fall back to WebView fetch for Edge Functions: the app
  // origin is `https://localhost`, so a retry here can surface Supabase's
  // generic "Failed to send a request to the Edge Function" toast. On web we
  // keep the browser fetch path.
  if (Capacitor.isNativePlatform()) {
    throw new Error("Storage proxy unavailable");
  }

  const post = (token: string) =>
    fetch(endpoint, {
      method: "POST",
      signal,
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  let fileResp = await post(accessToken);
  // An access token that expired between page load and tap makes the proxy
  // answer 401. One refresh is enough to unstick it.
  if (fileResp.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) fileResp = await post(freshToken);
  }
  if (!fileResp.ok) {
    // The edge function returns a JSON body with an actionable message
    // (e.g. storage_key_missing). Showing "HTTP 503" instead hides it.
    let detail = "";
    let code = "";
    try {
      const body = await fileResp.clone().json() as { error?: string; code?: string };
      detail = typeof body?.error === "string" ? body.error : "";
      code = typeof body?.code === "string" ? body.code : "";
    } catch { /* non-JSON body — fall back to the status code */ }
    const err = new Error(
      [detail || `Storage proxy HTTP ${fileResp.status}`, code ? `(${code})` : ""].join(" ").trim(),
    ) as Error & { status?: number; code?: string };
    err.status = fileResp.status;
    if (code) err.code = code;
    throw err;
  }

  return fileResp.blob();
}

/**
 * True for any URL we know how to convert into raw PDF bytes.
 * Currently: Naveen-Bharat storage `/view/<id>` viewer pages.
 * (Generic remote PDFs are left alone so pdf.js can stream them with range
 * requests — pre-materializing them would break streaming.)
 */
export function isResolvableStorageViewerUrl(url: string): boolean {
  return isNaveenStorageViewUrl(url);
}

/** Resolve a known viewer URL into a PDF Blob. */
export async function resolveStorageBytes(url: string, signal?: AbortSignal): Promise<Blob> {
  if (isNaveenStorageViewUrl(url)) return fetchNaveenStoragePdf(url, signal);
  // Fallback: fetch directly; if we got HTML back, treat as failure.
  const resp = await fetch(url, { signal, credentials: "omit" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";
  if (/text\/html/i.test(ct)) throw new Error("Source is an HTML viewer, not a PDF");
  return resp.blob();
}