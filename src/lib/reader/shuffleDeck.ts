/**
 * Per-document persistence for the Shuffle (FSRS) page deck.
 *
 * A deck is at most `MAX_DECK_PAGES` small records, so localStorage is the
 * right store: synchronous reads keep the settings sheet's summary instant,
 * and the whole thing serialises to a few KB. Every access goes through the
 * guarded `safeGet`/`safeSet` wrappers, so a private-mode quota error degrades
 * to "no saved progress" instead of throwing into a render path.
 */

import { safeGet, safeSet, safeRemove } from "../storage";
import { newCard, type Grade, type PageCard, reviewCard } from "./fsrsScheduler";

const KEY_PREFIX = "nb_fsrs_deck:";
/** Mirrors `MAX_LIST_LENGTH` in the dwell engine — the route is scanned per frame. */
export const MAX_DECK_PAGES = 500;

const deckKey = (docKey: string) => `${KEY_PREFIX}${docKey}`;

const isFinitePositive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Coerces untrusted JSON into safe cards; malformed entries are dropped. */
export function normalizeDeck(raw: unknown): PageCard[] {
  if (!Array.isArray(raw)) return [];
  const out: PageCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<PageCard>;
    if (!isFinitePositive(c.page)) continue;
    out.push({
      page: Math.floor(c.page),
      difficulty: Number.isFinite(c.difficulty) ? Math.max(0, Math.min(10, c.difficulty as number)) : 0,
      stability: Number.isFinite(c.stability) ? Math.max(0, c.stability as number) : 0,
      lastReviewedAt: Number.isFinite(c.lastReviewedAt) ? Math.max(0, c.lastReviewedAt as number) : 0,
      reps: Number.isFinite(c.reps) ? Math.max(0, Math.floor(c.reps as number)) : 0,
      lapses: Number.isFinite(c.lapses) ? Math.max(0, Math.floor(c.lapses as number)) : 0,
    });
    if (out.length >= MAX_DECK_PAGES) break;
  }
  return out;
}

export function loadDeck(docKey: string | undefined | null): PageCard[] {
  if (!docKey) return [];
  const raw = safeGet(deckKey(docKey));
  if (!raw) return [];
  try {
    return normalizeDeck(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveDeck(docKey: string | undefined | null, cards: PageCard[]): void {
  if (!docKey) return;
  safeSet(deckKey(docKey), JSON.stringify(cards.slice(0, MAX_DECK_PAGES)));
}

export function resetDeck(docKey: string | undefined | null): void {
  if (!docKey) return;
  safeRemove(deckKey(docKey));
}

/**
 * Applies one inferred review to a page and persists the deck.
 * Returns the updated deck so callers can refresh a summary without re-reading.
 */
export function recordReview(
  docKey: string | undefined | null,
  page: number,
  grade: Grade,
  now = Date.now()
): PageCard[] {
  if (!docKey || !isFinitePositive(page)) return [];
  const deck = loadDeck(docKey);
  const idx = deck.findIndex((c) => c.page === page);
  const current = idx >= 0 ? deck[idx] : newCard(Math.floor(page));
  const next = reviewCard(current, grade, now);
  if (idx >= 0) deck[idx] = next;
  else deck.push(next);
  saveDeck(docKey, deck);
  return deck;
}
