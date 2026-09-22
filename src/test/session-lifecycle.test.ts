/**
 * Audit 2026-09-22 — mobile lifecycle guards.
 *  1. A persisted session token whose server slot was retired (idle sweep /
 *     eviction) is replaced on relaunch instead of heartbeating forever.
 *  2. Coming back to the foreground sends one heartbeat (rate-limited).
 *  3. The offline mutation-queue tick does no work while the WebView is hidden
 *     and drains once on return.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeSpy = vi.fn();
const getSessionSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeSpy(...args) },
    auth: { getSession: () => getSessionSpy() },
  },
}));

const actions = () =>
  invokeSpy.mock.calls.map(([, opts]) => (opts as { body?: { action?: string } })?.body?.action);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("session tracker survives a retired server slot", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeSpy.mockReset();
    getSessionSpy.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    window.localStorage.clear();
    setVisibility("visible");
  });
  afterEach(async () => {
    const { stopSessionTracking } = await import("@/lib/native/sessionTracker");
    await stopSessionTracking();
  });

  it("re-creates the session when the heartbeat reports active:false", async () => {
    invokeSpy.mockImplementation(async (_name: string, opts: { body: { action: string } }) => {
      if (opts.body.action === "create") return { data: { session_token: "tok-new" }, error: null };
      if (opts.body.action === "heartbeat") return { data: { ok: true, active: false }, error: null };
      return { data: { ok: true }, error: null };
    });
    // Simulate a previous launch that persisted a token.
    window.localStorage.setItem("nb.session_token.v1", JSON.stringify({ userId: "u1", token: "tok-old" }));

    const { startSessionTracking } = await import("@/lib/native/sessionTracker");
    await startSessionTracking("u1");

    expect(actions()).toEqual(["heartbeat", "create"]);
    const heartbeatBody = invokeSpy.mock.calls[0][1] as { body: { session_token: string } };
    expect(heartbeatBody.body.session_token).toBe("tok-old");
    expect(JSON.parse(window.localStorage.getItem("nb.session_token.v1")!)).toEqual({ userId: "u1", token: "tok-new" });
  });

  it("keeps the persisted slot when the server still reports it active (or says nothing)", async () => {
    invokeSpy.mockResolvedValue({ data: { ok: true }, error: null });
    window.localStorage.setItem("nb.session_token.v1", JSON.stringify({ userId: "u1", token: "tok-old" }));

    const { startSessionTracking } = await import("@/lib/native/sessionTracker");
    await startSessionTracking("u1");

    expect(actions()).toEqual(["heartbeat"]);
    expect(JSON.parse(window.localStorage.getItem("nb.session_token.v1")!).token).toBe("tok-old");
  });

  it("beats once on resume and ignores rapid re-foregrounding", async () => {
    vi.useFakeTimers();
    try {
      invokeSpy.mockResolvedValue({ data: { session_token: "tok-1" }, error: null });
      const { startSessionTracking } = await import("@/lib/native/sessionTracker");
      await startSessionTracking("u1");
      expect(actions()).toEqual(["create"]);

      // 6 minutes later the user comes back to the app.
      vi.setSystemTime(Date.now() + 6 * 60_000);
      window.dispatchEvent(new Event("app:resumed"));
      await vi.advanceTimersByTimeAsync(0);
      expect(actions()).toEqual(["create", "heartbeat"]);

      // Switching apps again 10 seconds later must not write again.
      vi.setSystemTime(Date.now() + 10_000);
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
      expect(actions()).toEqual(["create", "heartbeat"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("offline mutation queue respects app visibility", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    setVisibility("visible");
  });

  it("does not retry while hidden, retries once when visible again", async () => {
    vi.useFakeTimers();
    try {
      const mq = await import("@/lib/offline/mutationQueue");
      // First attempt (fired synchronously by enqueue) fails → 1s backoff.
      const handler = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
      mq.registerMutationHandler("t", handler);
      const stop = mq.installMutationQueueRunner();
      await vi.advanceTimersByTimeAsync(0);

      setVisibility("hidden");
      mq.enqueueMutation("t", { n: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1); // the immediate attempt

      await vi.advanceTimersByTimeAsync(20_000); // backoff long expired, four hidden ticks
      expect(handler).toHaveBeenCalledTimes(1); // …but nothing ran in the background

      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(2); // drained on return
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
