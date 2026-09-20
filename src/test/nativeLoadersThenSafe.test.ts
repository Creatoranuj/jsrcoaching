import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

/**
 * Regression guard for Sentry SAFAR-ENGLISH-APP-13/14:
 *   "RazorpayNative.then()" is not implemented on android   (120 events)
 *
 * `registerPlugin()` hands back a Proxy that turns EVERY property read into a
 * native call. Resolving an async function with that proxy makes the Promise
 * machinery read `.then` on it ("thenable assimilation") — which Android
 * answers with UNIMPLEMENTED, so the loader rejected before `open()` ever ran
 * and BuyCourse silently fell back to the browser checkout.
 *
 * Two layers of protection:
 *   1. Runtime: a proxy that records every property read must never see
 *      `then` when the loader resolves.
 *   2. Static: no loader under src/lib/native may return/cache the bare
 *      `registerPlugin(...)` result.
 */

const accessed: PropertyKey[] = [];
const registerPluginMock = vi.fn((name: string) =>
  new Proxy(
    {},
    {
      get(_t, prop) {
        accessed.push(prop);
        if (prop === "then") {
          // Mirror Capacitor: every unknown property becomes a native call
          // that rejects with UNIMPLEMENTED on the device.
          return (_res: unknown, rej: (e: Error) => void) =>
            rej(new Error(`"${name}.then()" is not implemented on android`));
        }
        return vi.fn();
      },
    },
  ),
);

vi.mock("@capacitor/core", () => ({ registerPlugin: registerPluginMock }));

describe("loadRazorpayNative never resolves the bare Capacitor proxy", () => {
  beforeEach(() => {
    accessed.length = 0;
    registerPluginMock.mockClear();
  });
  afterEach(() => vi.resetModules());

  it("resolves a { plugin } container and never reads proxy.then", async () => {
    const mod = await import("@/lib/native/razorpay");
    mod.__resetRazorpayNativeCache();
    const container = await mod.loadRazorpayNative();
    expect(registerPluginMock).toHaveBeenCalledWith("RazorpayNative");
    expect(container).toHaveProperty("plugin");
    expect(accessed).not.toContain("then");
    // Container itself must be a plain object (not thenable).
    expect((container as { then?: unknown }).then).toBeUndefined();
  });

  it("memoizes the container across calls (one registerPlugin)", async () => {
    const mod = await import("@/lib/native/razorpay");
    mod.__resetRazorpayNativeCache();
    const a = await mod.loadRazorpayNative();
    const b = await mod.loadRazorpayNative();
    expect(a).toBe(b);
    expect(registerPluginMock).toHaveBeenCalledTimes(1);
  });
});

describe("src/lib/native loaders wrap plugin proxies in a container", () => {
  const dir = resolve(__dirname, "../lib/native");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  it.each(files)("%s does not return/cache a bare registerPlugin() proxy", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    // `cached = registerPlugin(` / `return registerPlugin(` / `resolve(registerPlugin(`
    expect(src).not.toMatch(/(?:cached\s*=|return|resolve\()\s*registerPlugin\s*[<(]/);
  });

  it("razorpay.ts callers destructure { plugin } instead of using the container as the plugin", () => {
    const callers = [
      "../utils/razorpayNative.ts",
      "../utils/upiApps.ts",
    ];
    for (const rel of callers) {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      // Must never call .open()/.getUpiApps() on the awaited container directly.
      expect(src).not.toMatch(/const\s+\w+\s*=\s*await\s+(?:withTimeout\(\s*)?loadRazorpayNative\(\)/);
      expect(src).toMatch(/\{\s*plugin(?:\s*:\s*\w+)?\s*\}\s*=\s*await/);
    }
  });
});
