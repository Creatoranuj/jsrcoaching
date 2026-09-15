/**
 * User-tunable Shuffle (FSRS) knobs, mirrored from Anki's deck options.
 *
 * Stored globally (not per document) because they express *how the reader
 * likes to revise*, not anything about a particular PDF. localStorage is
 * wrapped because private mode / WebView restrictions can throw on access.
 */

export interface ShufflePrefs {
  /** Desired retention, 0.7..0.97. Higher = pages come back sooner. */
  retention: number;
  /** Share of new pages woven into the due stream, 0..1. */
  newMix: number;
  /** Max pages in one session; 0 = no cap. */
  sessionLimit: number;
  /** Lapses before a page is treated as a leech and pulled to the front. */
  leechThreshold: number;
}

export const DEFAULT_SHUFFLE_PREFS: ShufflePrefs = {
  retention: 0.9,
  newMix: 0.35,
  sessionLimit: 0,
  leechThreshold: 8,
};

const KEY = "nb_shuffle_prefs_v1";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function loadShufflePrefs(): ShufflePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SHUFFLE_PREFS };
    const p = JSON.parse(raw) as Partial<ShufflePrefs>;
    return {
      retention: clamp(Number(p.retention) || DEFAULT_SHUFFLE_PREFS.retention, 0.7, 0.97),
      newMix: clamp(Number(p.newMix ?? DEFAULT_SHUFFLE_PREFS.newMix), 0, 1),
      sessionLimit: Math.max(0, Math.floor(Number(p.sessionLimit) || 0)),
      leechThreshold: Math.max(2, Math.floor(Number(p.leechThreshold) || DEFAULT_SHUFFLE_PREFS.leechThreshold)),
    };
  } catch {
    return { ...DEFAULT_SHUFFLE_PREFS };
  }
}

export function saveShufflePrefs(prefs: ShufflePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — prefs stay session-only */
  }
}
