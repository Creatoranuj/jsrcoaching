import { itemDB } from "./personalLibraryDB";

/**
 * No app-imposed storage cap. My Library is 100% on-device (IndexedDB +
 * Capacitor Filesystem) — it costs no Supabase storage or egress, so an
 * artificial 500 MB limit bought us nothing.
 *
 * The only real limit is the device/WebView quota. We read it from
 * `navigator.storage.estimate()` and refuse an import only when the device
 * itself genuinely lacks room (file size + safety headroom).
 */

/** Keep a little room so the OS doesn't start evicting our origin. */
const SAFETY_HEADROOM_BYTES = 64 * 1024 * 1024;

export interface DeviceSpace {
  /** Bytes attributable to our origin, as reported by the platform. */
  quota: number | null;
  free: number | null;
}

export async function getDeviceSpace(): Promise<DeviceSpace> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { quota: null, free: null };
    }
    const est = await navigator.storage.estimate();
    const quota = typeof est.quota === "number" ? est.quota : null;
    const usage = typeof est.usage === "number" ? est.usage : 0;
    return { quota, free: quota === null ? null : Math.max(0, quota - usage) };
  } catch {
    return { quota: null, free: null };
  }
}

/** Bytes used by items tracked in the personal library index. */
export async function getUsedBytes(): Promise<number> {
  const all = await itemDB.all();
  return all.reduce((s, i) => s + (i.size_bytes || 0), 0);
}

export interface QuotaCheck {
  ok: boolean;
  used: number;
  quota: number | null;
  free: number | null;
}

export async function canAdd(size: number): Promise<QuotaCheck> {
  const [used, { quota, free }] = await Promise.all([getUsedBytes(), getDeviceSpace()]);
  // Unknown quota → let the write attempt proceed; the storage layer already
  // rolls back cleanly on QuotaExceededError.
  const ok = free === null ? true : free >= size + SAFETY_HEADROOM_BYTES;
  return { ok, used, quota, free };
}

/** True when the device is close enough to full that the OS may evict us. */
export function isLowOnSpace(quota: number | null, free: number | null): boolean {
  if (quota === null || free === null || quota === 0) return false;
  return free < Math.min(500 * 1024 * 1024, quota * 0.1);
}

export function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
