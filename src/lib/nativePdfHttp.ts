import { Capacitor, CapacitorHttp } from "@capacitor/core";

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

type NativePdfRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  data?: unknown;
  signal?: AbortSignal;
};

function abortError(): Error {
  const err = new Error("Native PDF request aborted");
  err.name = "AbortError";
  return err;
}

function base64ToBytes(input: string): Uint8Array {
  const base64 = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const clean = base64.replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * Capacitor Android WebView often blocks/stalls pdf.js range/fetch requests
 * against Drive/Supabase/CDN URLs because the app origin is `https://localhost`.
 * Fetching the same bytes through CapacitorHttp uses Android's native network
 * stack, bypassing WebView CORS/range quirks while keeping the PDF in-app.
 *
 * Returns `null` on web/non-native so callers can use their normal browser path.
 */
export async function requestPdfViaNativeHttp(
  url: string,
  options: NativePdfRequestOptions = {},
): Promise<Blob | null> {
  if (!isHttpUrl(url)) return null;
  if (!Capacitor.isNativePlatform()) return null;
  const { method = "GET", headers, data: requestData, signal } = options;
  if (signal?.aborted) throw abortError();

  const request = CapacitorHttp.request({
    url,
    method,
    responseType: "arraybuffer",
    connectTimeout: 30000,
    readTimeout: /pdf-proxy\?kind=drive|[?&]kind=drive/i.test(url) ? 180000 : 120000,
    headers: {
      Accept: "application/pdf,application/octet-stream,*/*",
      ...headers,
    },
    data: requestData,
  });

  const response = signal
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(abortError()), { once: true });
        }),
      ])
    : await request;

  if (response.status < 200 || response.status >= 300) {
    const err = new Error(`HTTP ${response.status}`) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const data = response.data;
  if (typeof data === "string") {
    return new Blob([bytesToArrayBuffer(base64ToBytes(data))], { type: "application/pdf" });
  }
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: "application/pdf" });
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return new Blob([bytesToArrayBuffer(bytes)], {
      type: "application/pdf",
    });
  }

  throw new Error("Native HTTP did not return PDF bytes");
}

export async function fetchPdfViaNativeHttp(
  url: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    return await requestPdfViaNativeHttp(url, { signal });
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    const msg = (err as Error)?.message || String(err);
    // Real user cancel — propagate so callers can distinguish.
    if (name === "AbortError") throw err;
    // Known Android WebView / OkHttp transient failures. Returning null lets
    // callers fall back to the browser `fetch()` path instead of surfacing an
    // unhandled promise rejection ("TypeError: Failed to fetch" / "network
    // error" / "Software caused connection abort") from CapacitorHttp.
    if (/failed to fetch|network error|network request failed|connection abort|connection reset|ECONNRESET|ETIMEDOUT|timeout|Load failed/i.test(msg)) {
      return null;
    }
    // HTTP status errors and unexpected shapes: also fall back rather than
    // crash the reader — the browser fetch retry in useLocalPdfSource has
    // its own signed-URL refresh path.
    return null;
  }
}

/**
 * Small-JSON companion for `fetchPdfViaNativeHttp`. Same rationale: on Android
 * APKs the WebView `fetch()` against Supabase Edge Functions intermittently
 * throws `TypeError: Failed to fetch` / `SocketException: Connection reset`
 * because the app origin is `https://localhost`. Routing through
 * `CapacitorHttp` uses the native OkHttp stack and sidesteps that.
 *
 * Returns parsed JSON on success, `null` on transient failure (so callers can
 * fall back to browser `fetch()`), or throws `AbortError` on real cancel.
 */
export async function fetchJsonViaNativeHttp<T = unknown>(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T | null> {
  if (!isHttpUrl(url)) return null;
  if (!Capacitor.isNativePlatform()) return null;
  if (signal?.aborted) throw abortError();
  try {
    const request = CapacitorHttp.request({
      url,
      method: "GET",
      responseType: "json",
      connectTimeout: 15000,
      readTimeout: 30000,
      headers: { Accept: "application/json,*/*", ...headers },
    });
    const response = signal
      ? await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(abortError()), { once: true });
          }),
        ])
      : await request;
    if (response.status < 200 || response.status >= 300) return null;
    const data = response.data;
    if (data && typeof data === "object") return data as T;
    if (typeof data === "string") {
      try { return JSON.parse(data) as T; } catch { return null; }
    }
    return null;
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    if (name === "AbortError") throw err;
    return null;
  }
}
