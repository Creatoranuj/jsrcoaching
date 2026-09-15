/**
 * Bridge layer — the single, typed boundary between app code and Capacitor.
 *
 * Why this exists:
 *   - Plugin imports stay confined to `src/lib/bridge/` and `src/lib/native/`
 *     so we can swap, lazy-load, or stub them without touching feature code.
 *   - Every native call is wrapped in `safeCall` so failures degrade to a
 *     typed `BridgeError` instead of crashing the React tree.
 *   - `isNative()` / `getPlatform()` give one canonical source of truth that
 *     hooks and components can depend on without re-importing `@capacitor/core`.
 *
 * Feature code should import from `@/lib/bridge` or a thin `@/lib/native/*`
 * wrapper — never from `@capacitor/*` directly. The ESLint rule enforces this.
 */
import { Capacitor } from "@capacitor/core";

export type Platform = "ios" | "android" | "web";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatform(): Platform {
  try {
    return Capacitor.getPlatform() as Platform;
  } catch {
    return "web";
  }
}

export function isPluginAvailable(name: string): boolean {
  try {
    return Capacitor.isPluginAvailable(name);
  } catch {
    return false;
  }
}

/**
 * Strongly-typed error thrown (or returned) when a native bridge call fails.
 * Wrap raw plugin errors so callers can branch on `.code` instead of string
 * matching message text.
 */
export class BridgeError extends Error {
  readonly code: string;
  readonly plugin: string;
  readonly method: string;
  readonly cause?: unknown;

  constructor(opts: {
    plugin: string;
    method: string;
    code?: string;
    message?: string;
    cause?: unknown;
  }) {
    super(opts.message ?? `[${opts.plugin}.${opts.method}] ${opts.code ?? "failed"}`);
    this.name = "BridgeError";
    this.plugin = opts.plugin;
    this.method = opts.method;
    this.code = opts.code ?? "BRIDGE_ERROR";
    this.cause = opts.cause;
  }
}

/** Common, predictable error codes — feature code can switch on these. */
export const BridgeErrorCode = {
  UNAVAILABLE: "BRIDGE_UNAVAILABLE",     // plugin not present (e.g. web build)
  CANCELLED:   "BRIDGE_CANCELLED",       // user cancelled (camera, picker…)
  PERMISSION:  "BRIDGE_PERMISSION",      // permission denied
  UNKNOWN:     "BRIDGE_UNKNOWN",
} as const;

function classify(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase();
  if (msg.includes("cancel")) return BridgeErrorCode.CANCELLED;
  if (msg.includes("permission") || msg.includes("denied")) return BridgeErrorCode.PERMISSION;
  if (msg.includes("not implemented") || msg.includes("unavailable")) return BridgeErrorCode.UNAVAILABLE;
  return BridgeErrorCode.UNKNOWN;
}

/**
 * Wrap a native call so failures become a typed `BridgeError`. On non-native
 * platforms (or when the plugin isn't installed) you can pass a `fallback`
 * value and the call resolves to that instead of throwing.
 */
export async function safeCall<T>(
  plugin: string,
  method: string,
  fn: () => Promise<T>,
  opts?: { fallback?: T; requireNative?: boolean },
): Promise<T> {
  if (opts?.requireNative && !isNative()) {
    if (opts.fallback !== undefined) return opts.fallback;
    throw new BridgeError({
      plugin, method,
      code: BridgeErrorCode.UNAVAILABLE,
      message: `${plugin}.${method} requires a native platform`,
    });
  }
  try {
    return await fn();
  } catch (err) {
    if (opts && "fallback" in opts) return opts.fallback as T;
    throw new BridgeError({
      plugin, method,
      code: classify(err),
      message: (err as { message?: string })?.message,
      cause: err,
    });
  }
}

export { env } from "./env";
