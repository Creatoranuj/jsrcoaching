/**
 * Singleton guard smoke test for useAndroidBackButton.
 *
 * Regression target: in React StrictMode (and during HMR), every hook mounts
 * twice. The classic bug this guards is "press back once → app exits" caused
 * by two App.backButton listeners being registered. The hook protects against
 * this with a module-level singleton (`removeBackButtonListener` + a setup
 * promise). If a future refactor accidentally moves that state into the hook
 * closure, this test fails immediately.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useAndroidBackButton singleton", () => {
  const src = readFileSync(
    resolve(__dirname, "../useAndroidBackButton.ts"),
    "utf8",
  );

  it("declares a module-level guard, not a hook-scoped one", () => {
    // The guard variables must live at module scope (outside the hook fn).
    expect(src).toMatch(/^let\s+removeBackButtonListener/m);
    expect(src).toMatch(/^let\s+setupPromise/m);
    expect(src).toMatch(/^let\s+activeHookCount/m);
  });

  it("registers exactly one App.backButton listener via a setupPromise gate", () => {
    // The setup function must early-return if a listener is already
    // registered OR if another mount is mid-setup.
    expect(src).toMatch(
      /if\s*\(\s*removeBackButtonListener\s*\|\|\s*setupPromise\s*\)/,
    );
  });

  it("dynamically imports @capacitor/app via the shared bridge (web builds stay native-free)", () => {
    // The hook must NOT statically import the native plugin — it delegates to
    // the shared memoized loader `src/lib/native/app.ts`, which owns the single
    // dynamic import. This keeps @capacitor/app off the static graph for
    // SSR/web builds while letting Vite code-split it into vendor-capacitor for
    // native Android, and collapses 4 call-sites onto one Promise.
    expect(src).toMatch(/loadCapacitorApp[\s\S]*from\s*["']@\/lib\/native\/app["']/);
    // No direct static import of the raw plugin in the hook.
    expect(src).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+["']@capacitor\/app["']/m);

    // The bridge itself must use the static-dynamic import form so Vite
    // resolves and chunks it (a bare `import(pkg)` variable would leave an
    // unresolvable specifier in the WebView bundle → runtime TypeError).
    const bridge = readFileSync(
      resolve(__dirname, "../../lib/native/app.ts"),
      "utf8",
    );
    expect(bridge).toMatch(/\bimport\(\s*["']@capacitor\/app["']\s*\)/);
  });

  it("exposes a debug snapshot that reports registration state", () => {
    expect(src).toMatch(/listenerRegistered:\s*!!removeBackButtonListener/);
  });
});
