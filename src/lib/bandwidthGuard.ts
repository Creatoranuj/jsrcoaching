/**
 * Bandwidth guard — one place that owns "how much data may this app pull".
 *
 * Two halves:
 *  - **Prefs** (persisted): caps an admin can tune from `/admin/bandwidth`.
 *  - **Counters** (in-memory, per session): what actually happened, so the
 *    settings page can show real download health instead of promises.
 *
 * Deliberately dependency-free and synchronous: every download path
 * (`prefetch`, link import, PDF fetch) can consult it without awaiting.
 */

export type BandwidthPrefs = {
  /** Hard ceiling for a single downloaded file, in MB. */
  perFileMb: number;
  /** Total bytes this session may download before the guard says stop, in MB. */
  sessionBudgetMb: number;
  /** Warm route chunks on idle. Off = smallest possible data use. */
  prefetchEnabled: boolean;
  /**
   * Data saver: on a metered/slow connection, skip prefetch and ask for the
   * lower video ladder even when the caps above would allow more.
   */
  dataSaver: boolean;
  /** Highest video ladder rung the player may request. */
  videoQualityCap: "auto" | "1080p" | "720p" | "480p" | "360p";
};

export const BANDWIDTH_DEFAULTS: BandwidthPrefs = {
  perFileMb: 200,
  sessionBudgetMb: 1500,
  prefetchEnabled: true,
  dataSaver: false,
  videoQualityCap: "auto",
};

export const BANDWIDTH_LIMITS = {
  perFileMb: { min: 5, max: 2048 },
  sessionBudgetMb: { min: 50, max: 20480 },
} as const;

const STORAGE_KEY = "nb_bandwidth_prefs_v1";
const QUALITIES: BandwidthPrefs["videoQualityCap"][] = ["auto", "1080p", "720p", "480p", "360p"];

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : min;

/** Coerce anything (old shape, hand-edited storage, partial patch) to valid prefs. */
export function normalizePrefs(raw: unknown): BandwidthPrefs {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<BandwidthPrefs>;
  return {
    perFileMb: clamp(
      Number(src.perFileMb ?? BANDWIDTH_DEFAULTS.perFileMb),
      BANDWIDTH_LIMITS.perFileMb.min,
      BANDWIDTH_LIMITS.perFileMb.max,
    ),
    sessionBudgetMb: clamp(
      Number(src.sessionBudgetMb ?? BANDWIDTH_DEFAULTS.sessionBudgetMb),
      BANDWIDTH_LIMITS.sessionBudgetMb.min,
      BANDWIDTH_LIMITS.sessionBudgetMb.max,
    ),
    prefetchEnabled: src.prefetchEnabled !== false,
    dataSaver: src.dataSaver === true,
    videoQualityCap: QUALITIES.includes(src.videoQualityCap as BandwidthPrefs["videoQualityCap"])
      ? (src.videoQualityCap as BandwidthPrefs["videoQualityCap"])
      : BANDWIDTH_DEFAULTS.videoQualityCap,
  };
}

let cached: BandwidthPrefs | null = null;
const listeners = new Set<(p: BandwidthPrefs) => void>();

export function getBandwidthPrefs(): BandwidthPrefs {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = normalizePrefs(raw ? JSON.parse(raw) : {});
  } catch {
    cached = { ...BANDWIDTH_DEFAULTS };
  }
  return cached;
}

export function setBandwidthPrefs(patch: Partial<BandwidthPrefs>): BandwidthPrefs {
  const next = normalizePrefs({ ...getBandwidthPrefs(), ...patch });
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — prefs stay in memory for this session */
  }
  listeners.forEach((fn) => fn(next));
  return next;
}

export function resetBandwidthPrefs(): BandwidthPrefs {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const next = getBandwidthPrefs();
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeBandwidthPrefs(fn: (p: BandwidthPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Session counters
// ---------------------------------------------------------------------------

export type BandwidthStats = {
  downloadedBytes: number;
  downloads: number;
  cacheHits: number;
  failures: number;
  retries: number;
  blocked: number;
  startedAt: number;
};

const stats: BandwidthStats = {
  downloadedBytes: 0,
  downloads: 0,
  cacheHits: 0,
  failures: 0,
  retries: 0,
  blocked: 0,
  startedAt: Date.now(),
};

export function recordDownload(bytes: number) {
  if (Number.isFinite(bytes) && bytes > 0) stats.downloadedBytes += bytes;
  stats.downloads += 1;
}
export function recordCacheHit() { stats.cacheHits += 1; }
export function recordDownloadFailure() { stats.failures += 1; }
export function recordRetry() { stats.retries += 1; }

export function getBandwidthStats(): Readonly<BandwidthStats> {
  return stats;
}

export function resetBandwidthStats() {
  stats.downloadedBytes = 0;
  stats.downloads = 0;
  stats.cacheHits = 0;
  stats.failures = 0;
  stats.retries = 0;
  stats.blocked = 0;
  stats.startedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Decisions — the part other modules call
// ---------------------------------------------------------------------------

const MB = 1024 * 1024;

/** True when the OS reports a metered or slow connection. */
export function isConstrainedNetwork(): boolean {
  const conn = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

export function shouldPrefetch(): boolean {
  const prefs = getBandwidthPrefs();
  if (!prefs.prefetchEnabled) return false;
  if (prefs.dataSaver && isConstrainedNetwork()) return false;
  return true;
}

export type DownloadDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Gate a download before a single byte moves. `bytes` may be unknown (null)
 * when the server sends no content-length — then only the session budget is
 * checked and the caller must still stream-cap with `perFileMb`.
 */
export function canDownload(bytes: number | null): DownloadDecision {
  const prefs = getBandwidthPrefs();
  if (bytes != null && bytes > prefs.perFileMb * MB) {
    stats.blocked += 1;
    return {
      allowed: false,
      reason: `File is larger than the ${prefs.perFileMb} MB per-file limit.`,
    };
  }
  const projected = stats.downloadedBytes + (bytes ?? 0);
  if (projected > prefs.sessionBudgetMb * MB) {
    stats.blocked += 1;
    return {
      allowed: false,
      reason: `This session's ${prefs.sessionBudgetMb} MB download budget is used up.`,
    };
  }
  return { allowed: true };
}

/** Byte ceiling a streaming reader should abort at. */
export function maxDownloadBytes(): number {
  return getBandwidthPrefs().perFileMb * MB;
}

export function fmtBandwidth(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
}
