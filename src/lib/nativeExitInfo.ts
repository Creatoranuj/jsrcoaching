/**
 * Native exit-reason reporting — the "why did the app die?" signal that used
 * to require `adb logcat`.
 *
 * Android keeps a short history of process deaths
 * (`ActivityManager.getHistoricalProcessExitReasons`, API 30+). Our
 * `AppExitInfo` Capacitor plugin exposes it; on the next cold boot we read the
 * newest record, decide whether it was abnormal, and forward it to Sentry.
 *
 * Result: a low-memory kill, a native crash or an ANR now shows up in triage
 * on its own, instead of being invisible to the JS crash shield (which only
 * ever saw failures happening *inside* the WebView).
 *
 * The classifier below is pure so it can be unit-tested without a device.
 */
import { addBreadcrumb, captureException } from "./sentry";
import { safeGet, safeSet } from "./storage";

const LAST_SEEN_KEY = "nb_last_exit_ts";

export interface NativeExitRecord {
  reason: number;
  reasonName: string;
  status?: number;
  importance?: number;
  timestamp: number;
  pss?: number;
  rss?: number;
  description?: string;
}

export interface NativeExitInfoResult {
  supported: boolean;
  records: NativeExitRecord[];
  error?: string;
}

export type ExitSeverity = "abnormal" | "normal" | "unknown";

/** Reasons that mean "the app did NOT close because the user wanted it to". */
const ABNORMAL = new Set([
  "low_memory",
  "crash",
  "crash_native",
  "anr",
  "excessive_resource_usage",
  "initialization_failure",
  "signaled",
]);

const NORMAL = new Set([
  "user_requested",
  "user_stopped",
  "exit_self",
  "permission_change",
  "dependency_died",
]);

/** Pure: how should this exit record be treated in triage? */
export function classifyExit(record: Pick<NativeExitRecord, "reasonName">): ExitSeverity {
  const name = (record.reasonName || "").toLowerCase();
  if (ABNORMAL.has(name)) return "abnormal";
  if (NORMAL.has(name)) return "normal";
  return "unknown";
}

/** Pure: one-line, Sentry-groupable title for an exit record. */
export function describeExit(record: NativeExitRecord): string {
  const mb = typeof record.rss === "number" && record.rss > 0
    ? ` (${Math.round(record.rss / 1024)} MB RSS)`
    : "";
  return `native exit: ${record.reasonName || "unknown"}${mb}`;
}

/** Pure: newest record we have not reported yet, or null. */
export function pickNewUnreported(
  records: NativeExitRecord[],
  lastSeenTs: number
): NativeExitRecord | null {
  const fresh = records
    .filter((r) => Number.isFinite(r?.timestamp) && r.timestamp > lastSeenTs)
    .sort((a, b) => b.timestamp - a.timestamp);
  return fresh[0] ?? null;
}

/**
 * Read the last native exit reason and report it once.
 *
 * Safe on web and on Android < 30: the plugin resolves `supported: false` and
 * this becomes a no-op. Never throws — diagnostics must not create crashes.
 */
export async function reportLastNativeExit(): Promise<ExitSeverity | "skipped"> {
  try {
    const { loadCore } = await import("./native/core");
    const { Capacitor } = await loadCore();
    if (!Capacitor.isNativePlatform()) return "skipped";

    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{
      getExitInfo(): Promise<NativeExitInfoResult>;
    }>("AppExitInfo");

    const info = await plugin.getExitInfo();
    if (!info?.supported || !Array.isArray(info.records) || info.records.length === 0) {
      return "skipped";
    }

    const lastSeen = Number(safeGet(LAST_SEEN_KEY) || "0");
    const record = pickNewUnreported(info.records, lastSeen);
    if (!record) return "skipped";

    safeSet(LAST_SEEN_KEY, String(record.timestamp));

    const severity = classifyExit(record);
    const data = {
      reason: record.reasonName,
      reasonCode: record.reason,
      status: record.status,
      importance: record.importance,
      rssMB: typeof record.rss === "number" ? Math.round(record.rss / 1024) : null,
      pssMB: typeof record.pss === "number" ? Math.round(record.pss / 1024) : null,
      description: (record.description || "").slice(0, 200),
      agoMs: Math.max(0, Date.now() - record.timestamp),
    };

    addBreadcrumb("native-exit", describeExit(record), data);

    if (severity === "abnormal") {
      // An Error (not a string) so Sentry groups by the reason name.
      captureException(new Error(describeExit(record)), {
        source: "native-exit-info",
        ...data,
      });
    }
    return severity;
  } catch {
    return "skipped";
  }
}
