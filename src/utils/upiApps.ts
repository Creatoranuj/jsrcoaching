// Installed UPI app discovery (Android / Capacitor only).
//
// Razorpay's native sheet renders the UPI intent tiles itself. This helper
// exists so the purchase screen can tell the student BEFORE paying which UPI
// apps will be offered, and so a "UPI section missing" report can be split
// into its real causes:
//   - no UPI app installed on the phone   -> offer the UPI ID (VPA) flow
//   - test-mode Razorpay key              -> owner must switch to live keys
//   - UPI off on the Razorpay account     -> owner must enable it in Dashboard
//
// Never throws: on web, on an old APK without the bridge method, or on any
// PackageManager error it resolves to an empty list.
import { loadRazorpayNative } from "../lib/native/razorpay";

export interface UpiApp {
  packageName: string;
  /** Human label as shown in the launcher, e.g. "Google Pay". */
  label: string;
}

/** Friendly names for the apps students actually recognise. */
const FRIENDLY_LABELS: Record<string, string> = {
  "com.google.android.apps.nbu.paisa.user": "Google Pay",
  "com.phonepe.app": "PhonePe",
  "net.one97.paytm": "Paytm",
  "in.org.npci.upiapp": "BHIM",
  "in.amazon.mShop.android.shopping": "Amazon Pay",
  "com.dreamplug.androidapp": "CRED",
  "com.whatsapp": "WhatsApp Pay",
  "com.freecharge.android": "Freecharge",
  "com.mobikwik_new": "MobiKwik",
};

/** Order the well-known apps first; unknown ones keep their launcher label. */
const PREFERRED_ORDER = [
  "com.google.android.apps.nbu.paisa.user",
  "com.phonepe.app",
  "net.one97.paytm",
  "in.org.npci.upiapp",
];

/** Turns the raw bridge payload into a clean, de-duplicated, sorted list. */
export const normalizeUpiApps = (raw: unknown): UpiApp[] => {
  const apps = (raw as { apps?: unknown } | null | undefined)?.apps;
  if (!Array.isArray(apps)) return [];
  const seen = new Set<string>();
  const out: UpiApp[] = [];
  for (const entry of apps) {
    const pkg = (entry as { packageName?: unknown } | null)?.packageName;
    if (typeof pkg !== "string" || !pkg || seen.has(pkg)) continue;
    seen.add(pkg);
    const rawLabel = (entry as { label?: unknown }).label;
    out.push({
      packageName: pkg,
      label: FRIENDLY_LABELS[pkg] ?? (typeof rawLabel === "string" && rawLabel ? rawLabel : pkg),
    });
  }
  return out.sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(a.packageName);
    const bi = PREFERRED_ORDER.indexOf(b.packageName);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.label.localeCompare(b.label);
  });
};

/** Resolves to the installed UPI apps, or `[]` when it cannot be determined. */
export const listUpiApps = async (): Promise<UpiApp[]> => {
  try {
    const plugin = await loadRazorpayNative();
    if (typeof plugin.getUpiApps !== "function") return [];
    return normalizeUpiApps(await plugin.getUpiApps());
  } catch {
    return [];
  }
};
