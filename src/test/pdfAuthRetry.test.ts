import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock supabase client BEFORE importing the helper.
const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => refreshSession(...args) } },
}));
vi.mock("../lib/sentry", () => ({
  addBreadcrumb: vi.fn(),
}));

import { fetchWithAuthRetry, __resetForTests } from "../lib/pdfProxyAuthRetry";

const PROXY_URL_OLD = "https://x.supabase.co/functions/v1/pdf-proxy?kind=drive&id=abc&token=OLD";

describe("fetchWithAuthRetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetForTests();
    refreshSession.mockReset();
    fetchMock = vi.fn();
    // @ts-expect-error jsdom stub
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the first response untouched on 2xx", async () => {
    const ok = new Response("ok", { status: 200 });
    fetchMock.mockResolvedValueOnce(ok);
    const res = await fetchWithAuthRetry(PROXY_URL_OLD);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does NOT retry non-pdf-proxy 401s", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 401 }));
    const res = await fetchWithAuthRetry("https://cdn.example.com/foo.pdf");
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes once and retries with the new token on pdf-proxy 401", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response("pdf", { status: 200 }));
    refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "NEW" } },
      error: null,
    });
    const res = await fetchWithAuthRetry(PROXY_URL_OLD);
    expect(res.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    const retryUrl = String(fetchMock.mock.calls[1][0]);
    expect(retryUrl).toMatch(/token=NEW/);
    expect(retryUrl).not.toMatch(/token=OLD/);
  });

  it("dedupes concurrent refreshes across parallel callers", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (u.includes("token=OLD")) return new Response("expired", { status: 401 });
      return new Response("pdf", { status: 200 });
    });
    refreshSession.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { data: { session: { access_token: "NEW" } }, error: null };
    });

    const results = await Promise.all([
      fetchWithAuthRetry(PROXY_URL_OLD),
      fetchWithAuthRetry(PROXY_URL_OLD),
      fetchWithAuthRetry(PROXY_URL_OLD),
    ]);
    for (const r of results) expect(r.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original 401 when refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 401 }));
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error("nope") });
    const res = await fetchWithAuthRetry(PROXY_URL_OLD);
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
