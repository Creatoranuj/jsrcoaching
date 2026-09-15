import { Capacitor, CapacitorHttp } from "@capacitor/core";

const FUNCTIONS_PATH = "/functions/v1/";

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      out[key] = value;
    });
    return out;
  }
  return { ...headers };
}

function responseBody(data: unknown): BodyInit | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }
  return JSON.stringify(data);
}

function requestBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return body;
}

export const capacitorFunctionFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (!Capacitor.isNativePlatform() || !url.includes(FUNCTIONS_PATH)) {
    return fetch(input, init);
  }

  try {
    const requestHeaders = input instanceof Request ? headersToRecord(input.headers) : {};
    const initHeaders = headersToRecord(init?.headers);
    const body = init?.body ?? (input instanceof Request ? await input.clone().text().catch(() => undefined) : undefined);
    const response = await CapacitorHttp.request({
      url,
      method: init?.method ?? (input instanceof Request ? input.method : "GET"),
      headers: { ...requestHeaders, ...initHeaders },
      data: requestBody(body),
      responseType: "text",
      connectTimeout: 30_000,
      readTimeout: 120_000,
    });

    return new Response(responseBody(response.data), {
      status: response.status,
      headers: response.headers as HeadersInit,
    });
  } catch (err) {
    // In native APKs, falling back to WebView fetch reintroduces the exact CORS
    // failure this bridge prevents. Surface a non-CORS native error instead.
    throw new Error((err as Error)?.message || "Native Edge Function request failed", { cause: err });
  }
};