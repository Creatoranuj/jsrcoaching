/**
 * FSRS-based revision scheduler for PDF pages ("Shuffle" pause mode).
 *
 * Every page of the document is a flashcard. Instead of reading 1, 2, 3… the
 * autoscroll visits pages in the order a spaced-repetition scheduler says you
 * most need to see them.
 *
 * The model is FSRS (Free Spaced Repetition Scheduler) — the algorithm that
 * replaced SM-2 as Anki's default. Each card carries two numbers:
 *
 *   • stability  (S) — how many days the memory survives before recall drops
 *                      to the retention target.
 *   • difficulty (D) — 1..10, how hard this particular page is *for you*.
 *
 * Retrievability R(t) = (1 + FACTOR · t/S)^DECAY is the probability you still
 * remember the page right now. The queue is sorted by lowest R, so the pages
 * closest to being forgotten come first.
 *
 * There are no rating buttons: the grade is inferred from reading behaviour
 * (see `inferGrade`). This module is pure and side-effect free — persistence
 * lives in `shuffleDeck.ts` and the scroll loop in `useAutoScroll`.
 */

/** Anki's four answer buttons. */
export type Grade = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

export interface PageCard {
  page: number;
  /** 1..10. Higher = harder for this reader. */
  difficulty: number;
  /** Memory stability in days. */
  stability: number;
  /** Epoch ms of the last visit; 0 = never seen (a "new" card). */
  lastReviewedAt: number;
  reps: number;
  lapses: number;
}

/** FSRS-5 default weights (the `w` vector shipped as Anki's preset). */
export const FSRS_W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
] as const;

const DECAY = -0.5;
/** 0.9^(1/DECAY) − 1 — the constant that makes R(S days) = 0.9. */
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

/** Target recall. A page is "due" once R falls below this. */
export const RETENTION_TARGET = 0.9;

const MS_PER_DAY = 86_400_000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const newCard = (page: number): PageCard => ({
  page,
  difficulty: 0,
  stability: 0,
  lastReviewedAt: 0,
  reps: 0,
  lapses: 0,
});

export const isNewCard = (c: PageCard): boolean => !c.lastReviewedAt || c.stability <= 0;

/** Days since the last visit (never negative, so a clock skew can't explode R). */
export const elapsedDays = (card: PageCard, now: number): number =>
  Math.max(0, (now - card.lastReviewedAt) / MS_PER_DAY);

/**
 * Probability the reader still remembers this page. New cards return 0 so
 * they sort *after* genuinely forgotten pages but before well-known ones.
 */
export function retrievability(card: PageCard, now: number): number {
  if (isNewCard(card)) return 0;
  const t = elapsedDays(card, now);
  return clamp(Math.pow(1 + FACTOR * (t / card.stability), DECAY), 0, 1);
}

/**
 * A page is due once recall falls under the retention target. The target is
 * injectable: Anki's "desired retention" knob, 0.7 (relaxed, fewer repeats)
 * to 0.97 (aggressive, everything comes back fast).
 */
export const isDue = (card: PageCard, now: number, retention = RETENTION_TARGET): boolean =>
  !isNewCard(card) && retrievability(card, now) < retention;


// ── Initial state ────────────────────────────────────────────────────────
const initialStability = (g: Grade) => Math.max(0.1, FSRS_W[g - 1]);
const initialDifficulty = (g: Grade) =>
  clamp(FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1, 1, 10);

// ── Update rules ─────────────────────────────────────────────────────────
const nextDifficulty = (d: number, g: Grade): number => {
  const delta = d - FSRS_W[6] * (g - 3);
  // Mean reversion toward the "Easy" anchor keeps difficulty from ratcheting.
  const reverted = FSRS_W[7] * initialDifficulty(4) + (1 - FSRS_W[7]) * delta;
  return clamp(reverted, 1, 10);
};

const recallStability = (d: number, s: number, r: number, g: Grade): number => {
  const hardPenalty = g === 2 ? FSRS_W[15] : 1;
  const easyBonus = g === 4 ? FSRS_W[16] : 1;
  return (
    s *
    (1 +
      Math.exp(FSRS_W[8]) *
        (11 - d) *
        Math.pow(s, -FSRS_W[9]) *
        (Math.exp((1 - r) * FSRS_W[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
};

const forgetStability = (d: number, s: number, r: number): number =>
  FSRS_W[11] *
  Math.pow(d, -FSRS_W[12]) *
  (Math.pow(s + 1, FSRS_W[13]) - 1) *
  Math.exp((1 - r) * FSRS_W[14]);

/**
 * Applies one review to a card and returns the updated copy. Never mutates.
 * `now` is injected so the whole scheduler stays deterministic under test.
 */
export function reviewCard(card: PageCard, grade: Grade, now: number): PageCard {
  if (isNewCard(card)) {
    return {
      ...card,
      difficulty: initialDifficulty(grade),
      stability: initialStability(grade),
      lastReviewedAt: now,
      reps: card.reps + 1,
      lapses: card.lapses + (grade === 1 ? 1 : 0),
    };
  }
  const r = retrievability(card, now);
  const d = nextDifficulty(card.difficulty, grade);
  const s =
    grade === 1
      ? Math.min(forgetStability(card.difficulty, card.stability, r), card.stability)
      : recallStability(card.difficulty, card.stability, r, grade);
  return {
    ...card,
    difficulty: d,
    stability: clamp(Number.isFinite(s) ? s : card.stability, 0.1, 36500),
    lastReviewedAt: now,
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 1 ? 1 : 0),
  };
}

// ── Implicit grading ─────────────────────────────────────────────────────
/**
 * Turns reading behaviour into an Anki grade — no buttons on screen.
 *
 * `ratio` is the time actually spent on the page divided by the configured
 * pause length. Holding the FAB to pause, scrubbing back, or simply sitting on
 * a page all inflate it, which is exactly the signal we want: the longer you
 * had to stare at a page, the less you knew it.
 */
export function inferGrade(ratio: number, revisited = false): Grade {
  if (revisited) return 1;
  if (!Number.isFinite(ratio) || ratio <= 0) return 3;
  if (ratio >= 2) return 1; // Again — needed far longer than planned
  if (ratio >= 1.3) return 2; // Hard
  if (ratio >= 0.7) return 3; // Good
  return 4; // Easy — skimmed past it
}

// ── Deterministic shuffle ────────────────────────────────────────────────
/** mulberry32 — small, fast, seeded PRNG so a session order is reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShuffleOptions {
  /** Inclusive page range; `0` on either side means "whole document". */
  from?: number;
  to?: number;
  /** Session seed — same seed, same order. */
  seed?: number;
  /** Hard cap on route length (mirrors `MAX_LIST_LENGTH`). */
  limit?: number;
  now?: number;
  /**
   * Desired retention (Anki's knob), 0.7..0.97. Higher = pages come back
   * sooner, so more of the deck counts as due.
   */
  retention?: number;
  /**
   * Share of new pages mixed into the due stream, 0..1. Anki's "new/review
   * mix": 0 keeps all revision first (default, old behaviour), 0.5 alternates
   * roughly one new page per due page.
   */
  newMix?: number;
  /**
   * Lapse count at which a page becomes a "leech". Leeches are pulled to the
   * front of the due stream instead of being buried — in a reader, a page you
   * keep forgetting is exactly the one worth re-reading.
   */
  leechThreshold?: number;
  /** Max pages per session (Anki's review limit). Applied after ordering. */
  sessionLimit?: number;
}


/**
 * Spreads neighbours apart: two pages within `gap` of each other should not be
 * shown back to back, because interleaved practice beats blocked practice.
 * A greedy pass is enough — it never reorders more than `gap` positions.
 */
function interleave(pages: number[], gap = 3): number[] {
  const out: number[] = [];
  const pending = [...pages];
  while (pending.length) {
    let pick = 0;
    for (let i = 0; i < pending.length; i++) {
      const clash = out
        .slice(-gap)
        .some((p) => Math.abs(p - pending[i]) <= 1);
      if (!clash) { pick = i; break; }
    }
    out.push(pending[pick]);
    pending.splice(pick, 1);
  }
  return out;
}

/** Weave `b` into `a` so that `mix` of the output comes from `b`. */
function weave(a: number[], b: number[], mix: number): number[] {
  if (mix <= 0 || !b.length) return [...a, ...b];
  if (mix >= 1 || !a.length) return [...b, ...a];
  const out: number[] = [];
  let ia = 0;
  let ib = 0;
  let debt = 0;
  while (ia < a.length || ib < b.length) {
    debt += mix;
    if ((debt >= 1 || ia >= a.length) && ib < b.length) {
      out.push(b[ib++]);
      debt -= 1;
    } else if (ia < a.length) {
      out.push(a[ia++]);
    }
  }
  return out;
}

/**
 * The revision order for one session.
 *
 * 1. Leeches (lapses ≥ threshold) first — the pages you keep forgetting.
 * 2. Then due pages, most-forgotten (lowest retrievability) first.
 * 3. New pages in document order, woven in at `newMix` (Anki's new/review mix).
 * 4. Then, if the deck is fully "known", the least-stable pages so a session
 *    never runs dry.
 * 5. Neighbours are interleaved and a seeded jitter breaks ties.
 */
export function buildShuffleRoute(
  cards: PageCard[],
  totalPages: number,
  opts: ShuffleOptions = {}
): number[] {
  const now = opts.now ?? Date.now();
  const limit = Math.max(1, opts.limit ?? 500);
  const rand = seededRandom(opts.seed ?? 1);
  const retention = clamp(opts.retention ?? RETENTION_TARGET, 0.7, 0.97);
  const newMix = clamp(opts.newMix ?? 0, 0, 1);
  const leechThreshold = Math.max(2, Math.floor(opts.leechThreshold ?? 8));

  const lo = Math.max(1, Math.floor(opts.from || 1));
  const hi = Math.min(
    Math.max(1, Math.floor(totalPages || 0)),
    opts.to && opts.to > 0 ? Math.floor(opts.to) : Number.MAX_SAFE_INTEGER
  );
  if (!(hi >= lo)) return [];

  const byPage = new Map(cards.map((c) => [c.page, c]));
  const deck: PageCard[] = [];
  for (let p = lo; p <= hi; p++) deck.push(byPage.get(p) ?? newCard(p));

  const dueAll = deck.filter((c) => isDue(c, now, retention));
  const leeches = dueAll.filter((c) => c.lapses >= leechThreshold);
  const due = dueAll.filter((c) => c.lapses < leechThreshold);
  const fresh = deck.filter((c) => isNewCard(c));
  const known = deck.filter((c) => !isNewCard(c) && !isDue(c, now, retention));

  // Jitter is ±0.02 of retrievability — enough to shuffle equal cards, never
  // enough to put a well-remembered page ahead of a forgotten one.
  const jitter = () => (rand() - 0.5) * 0.04;
  const byRecall = (a: PageCard, b: PageCard) =>
    retrievability(a, now) + jitter() - (retrievability(b, now) + jitter());
  leeches.sort((a, b) => b.lapses - a.lapses || byRecall(a, b));
  due.sort(byRecall);
  known.sort((a, b) => a.stability - b.stability);

  const revision = [...leeches.map((c) => c.page), ...interleave(due.map((c) => c.page))];
  const ordered = [
    ...weave(revision, fresh.map((c) => c.page), newMix),
    ...interleave(known.map((c) => c.page)),
  ];
  const capped = opts.sessionLimit && opts.sessionLimit > 0 ? ordered.slice(0, opts.sessionLimit) : ordered;
  return capped.slice(0, limit);
}


/** One-line deck summary for the settings sheet. */
export interface DeckStats {
  total: number;
  due: number;
  fresh: number;
  /** Pages forgotten `leechThreshold`+ times. */
  leeches: number;
  /** Mean retrievability across *seen* pages, 0..1. `null` when none seen. */
  avgRecall: number | null;
}

export function deckStats(
  cards: PageCard[],
  totalPages: number,
  opts: ShuffleOptions = {}
): DeckStats {
  const now = opts.now ?? Date.now();
  const retention = clamp(opts.retention ?? RETENTION_TARGET, 0.7, 0.97);
  const leechThreshold = Math.max(2, Math.floor(opts.leechThreshold ?? 8));
  const lo = Math.max(1, Math.floor(opts.from || 1));
  const hi = Math.min(
    Math.max(0, Math.floor(totalPages || 0)),
    opts.to && opts.to > 0 ? Math.floor(opts.to) : Number.MAX_SAFE_INTEGER
  );
  const total = Math.max(0, hi - lo + 1);
  const byPage = new Map(cards.map((c) => [c.page, c]));
  let dueCount = 0;
  let freshCount = 0;
  let leechCount = 0;
  let sum = 0;
  let seen = 0;
  for (let p = lo; p <= hi; p++) {
    const c = byPage.get(p);
    if (!c || isNewCard(c)) { freshCount++; continue; }
    seen++;
    sum += retrievability(c, now);
    if (isDue(c, now, retention)) dueCount++;
    if (c.lapses >= leechThreshold) leechCount++;
  }
  return {
    total,
    due: dueCount,
    fresh: freshCount,
    leeches: leechCount,
    avgRecall: seen ? sum / seen : null,
  };
}

/**
 * How many pages fall due on each of the next `days` days, assuming no extra
 * reviews happen. Powers the small forecast bar in the shuffle settings —
 * Anki's "Future due" graph, shrunk to a sparkline.
 */
export function forecastDue(
  cards: PageCard[],
  totalPages: number,
  days = 7,
  opts: ShuffleOptions = {}
): number[] {
  const now = opts.now ?? Date.now();
  const retention = clamp(opts.retention ?? RETENTION_TARGET, 0.7, 0.97);
  const lo = Math.max(1, Math.floor(opts.from || 1));
  const hi = Math.min(
    Math.max(0, Math.floor(totalPages || 0)),
    opts.to && opts.to > 0 ? Math.floor(opts.to) : Number.MAX_SAFE_INTEGER
  );
  const byPage = new Map(cards.map((c) => [c.page, c]));
  const out = new Array(Math.max(1, days)).fill(0) as number[];
  for (let p = lo; p <= hi; p++) {
    const c = byPage.get(p);
    if (!c || isNewCard(c)) continue;
    for (let d = 0; d < out.length; d++) {
      const at = now + d * MS_PER_DAY;
      const wasDue = d > 0 && isDue(c, now + (d - 1) * MS_PER_DAY, retention);
      if (!wasDue && isDue(c, at, retention)) {
        out[d]++;
        break;
      }
    }
  }
  return out;
}

