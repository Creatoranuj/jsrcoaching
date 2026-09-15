/**
 * Device-integrity check. Warns (does not block) when running on a rooted
 * Android device or jailbroken iOS device.
 *
 * We intentionally do NOT hard-block:
 *  - Premium video is already protected by short-lived signed Bunny tokens.
 *  - Hard blocks frustrate legitimate power users on rooted dev devices.
 *
 * Detection is best-effort using @capacitor/device + common indicators.
 * For stronger guarantees, swap in @capgo/capacitor-is-root or Play Integrity.
 *
 * OBS: `isVirtual` (emulator) is tracked separately from real root indicators.
 * Emulators are expected in CI (Maestro API 26/30/34) and on developer
 * machines — reporting them as Sentry exceptions burned quota on every green
 * CI run. Now: emulator-only → single breadcrumb, no exception, no toast.
 * Real root indicator → reportError + toast, as before.
 */
import { toast } from "sonner";
import { addBreadcrumb, reportError } from "@/lib/sentry";

let checked = false;

type Indicator = "virtual" | "test-keys" | "magisk-like";

export async function checkDeviceIntegrity(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();

    const matched: Indicator[] = [];
    if (info.isVirtual) matched.push("virtual");
    // NOTE: `test-keys` is the AOSP debug-build signing marker. Privacy ROMs
    // (GrapheneOS, CalyxOS) ship `release-keys` "user" builds and will NOT
    // match this regex — intentional, we do not want to flag them.
    if (/test-keys/i.test(info.osVersion ?? "")) matched.push("test-keys");
    if (
      /lineage|magisk|microg|supersu/i.test(info.model ?? "") ||
      /lineage|magisk|microg|supersu/i.test(info.manufacturer ?? "")
    ) {
      matched.push("magisk-like");
    }

    if (matched.length === 0) return;

    const realRoot = matched.some((m) => m !== "virtual");

    if (!realRoot) {
      // Emulator only. Breadcrumb so we can still correlate other issues to
      // "was on emulator", but no exception, no user-facing toast.
      // Category aligned with other native.* breadcrumbs for Sentry grouping.
      addBreadcrumb("native.security", "emulator-detected", {
        model: info.model,
        osVersion: info.osVersion,
      });
      return;
    }

    // Real root indicator matched — grep-friendly log + Sentry + toast.
     
    console.warn("[security] suspicious device: %s", matched.join(","));
    reportError(new Error("device_integrity_suspicious"), {
      surface: "native.security",
      matched: matched.join(","),
      model: info.model,
      osVersion: info.osVersion,
      isVirtual: info.isVirtual,
    });
    toast.warning("Device integrity check", {
      description: "This device may be rooted or modified. Some content may be restricted.",
      duration: 6000,
    });
  } catch {
    // best-effort
  }
}
