/**
 * Capacitor bridge call meter — ring buffer of the last 50 plugin invocations.
 * Updated by `recordBridgeCall` from native wrappers. Read by `PerfOverlay`.
 *
 * Zero cost when nothing reads from it. Safe on web (no-op equivalent).
 */

export type BridgeCall = {
  at: number;
  plugin: string;
  method: string;
  ms?: number;
};

const ring: BridgeCall[] = [];
const MAX = 50;
let total = 0;

export function recordBridgeCall(plugin: string, method: string, ms?: number) {
  ring.push({ at: Date.now(), plugin, method, ms });
  if (ring.length > MAX) ring.shift();
  total += 1;
}

export function getRecentBridgeCalls(): readonly BridgeCall[] {
  return ring;
}

export function getBridgeCallTotal(): number {
  return total;
}

/**
 * Convenience wrapper — instrument any async native call with timing.
 *   await meter("StatusBar", "setStyle", () => StatusBar.setStyle({ style }));
 */
export async function meter<T>(
  plugin: string,
  method: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    recordBridgeCall(plugin, method, performance.now() - t0);
  }
}
