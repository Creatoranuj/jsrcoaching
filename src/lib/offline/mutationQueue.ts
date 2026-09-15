/**
 * Offline mutation queue — hardened for "immortal" reliability.
 *
 * Persists pending writes in localStorage and replays them on `online` events,
 * with exponential backoff and a dead-letter queue for permanently failed items.
 *
 * Guarantees:
 *  - **Idempotency**: every enqueued item gets a stable `idempotencyKey` derived
 *    from `${kind}:${stableHash(payload)}` so a retried request can be deduped
 *    server-side within a 24h window.
 *  - **Exponential backoff**: 1s → 2s → 4s → 8s → 16s → 32s between attempts.
 *    Items are skipped until `nextAttemptAt` is reached.
 *  - **Max retries**: after `MAX_ATTEMPTS` (6) failures an item moves to the
 *    dead-letter queue (`nb:mutation-dlq:v1`) and is surfaced in Settings for
 *    manual review. It is NEVER silently dropped.
 *  - **Single runner**: a module-level lock prevents double-drain when both
 *    the `online` listener and an explicit `enqueueMutation()` fire together.
 *
 * NOT a replacement for full sync infra. Use only for low-volume, fire-and-
 * forget writes (analytics, "mark lesson watched", note updates). For
 * critical writes (payments, enrollment) always go through edge functions
 * with server-side idempotency keys.
 */
import { useEffect, useState } from "react";
import { addBreadcrumb, captureException } from "../sentry";

export interface QueuedMutation {
  id: string;
  /** Stable name so the runner can dispatch to the right handler. */
  kind: string;
  /** JSON-serialisable payload. */
  payload: unknown;
  /** Stable dedupe key — server should reject duplicates of the same key within 24h. */
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  /** Epoch ms — runner skips this item until now >= nextAttemptAt. */
  nextAttemptAt: number;
  /** Last error message (for DLQ inspection). */
  lastError?: string;
}

type Handler = (payload: unknown, ctx: { idempotencyKey: string }) => Promise<void>;

const STORAGE_KEY = "nb:mutation-queue:v1";
const DLQ_KEY = "nb:mutation-dlq:v1";
const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];
/** Hard cap so a runaway offline session can't blow past a browser's ~5MB
 * localStorage budget or a native WebView's IDB quota. Items past this cap
 * are dropped with a Sentry breadcrumb + captureException. */
const MAX_QUEUE_ITEMS = 500;
const QUOTA_WARN_BYTES = 50 * 1024 * 1024; // 50MB

const handlers = new Map<string, Handler>();
let running = false;

// --- storage helpers -------------------------------------------------------

function readKey<T = QueuedMutation[]>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : ([] as unknown as T);
  } catch {
    return [] as unknown as T;
  }
}

function writeKey(key: string, items: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* quota */ }
}

const read = () => readKey<QueuedMutation[]>(STORAGE_KEY);
const write = (items: QueuedMutation[]) => writeKey(STORAGE_KEY, items);
const readDlq = () => readKey<QueuedMutation[]>(DLQ_KEY);
const writeDlq = (items: QueuedMutation[]) => writeKey(DLQ_KEY, items);

// --- stable hashing (FNV-1a, 32-bit) --------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") + "}";
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function makeIdempotencyKey(kind: string, payload: unknown): string {
  return `${kind}:${fnv1a(stableStringify(payload))}`;
}

// --- public API -----------------------------------------------------------

/** Register a handler for a mutation `kind`. Call once at app boot. */
export function registerMutationHandler(kind: string, handler: Handler): void {
  handlers.set(kind, handler);
}

/** Push a mutation onto the queue. Returns its id. */
export function enqueueMutation(kind: string, payload: unknown): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKey = makeIdempotencyKey(kind, payload);
  const items = read();
  // Dedupe in-memory: if the same idempotency key is already queued, skip.
  if (items.some((q) => q.idempotencyKey === idempotencyKey)) return id;
  // Hard cap — refuse enqueue past MAX_QUEUE_ITEMS to protect quota. The
  // caller sees the id but the item is dropped + reported to Sentry so we
  // can see if any surface is a runaway producer.
  if (items.length >= MAX_QUEUE_ITEMS) {
    addBreadcrumb("offline-queue", "enqueue-dropped-quota", { kind, size: items.length });
    captureException(new Error("offline-queue full — dropped mutation"), { kind, size: items.length });
    return id;
  }
  items.push({
    id, kind, payload, idempotencyKey,
    createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now(),
  });
  write(items);
  // Best-effort storage quota probe — non-blocking.
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    navigator.storage.estimate().then((est) => {
      if (est.usage && est.usage > QUOTA_WARN_BYTES) {
        addBreadcrumb("offline-queue", "quota-warn", { usage: est.usage, quota: est.quota });
      }
    }).catch(() => { /* noop */ });
  }
  void runQueue();
  return id;
}

/** Drain the queue. Safe to call repeatedly; only one runner executes. */
export async function runQueue(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    let items = read();
    const now = Date.now();
    for (const item of [...items]) {
      if (item.nextAttemptAt > now) continue;
      const handler = handlers.get(item.kind);
      if (!handler) continue; // unknown kind — leave it for a future build
      try {
        item.attempts += 1;
        await handler(item.payload, { idempotencyKey: item.idempotencyKey });
        items = items.filter((q) => q.id !== item.id);
        write(items);
        addBreadcrumb("offline-queue", "drain-ok", { kind: item.kind, attempts: item.attempts });
      } catch (err) {
        item.lastError = err instanceof Error ? err.message : String(err);
        if (item.attempts >= MAX_ATTEMPTS) {
          // Move to dead-letter queue.
          items = items.filter((q) => q.id !== item.id);
          const dlq = readDlq();
          dlq.push(item);
          writeDlq(dlq);
          write(items);
          addBreadcrumb("offline-queue", "dlq", { kind: item.kind, lastError: item.lastError });
          captureException(err, { surface: "offline-queue:dlq", kind: item.kind });
        } else {
          const delay = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)];
          item.nextAttemptAt = Date.now() + delay;
          write(items.map((q) => (q.id === item.id ? item : q)));
          addBreadcrumb("offline-queue", "retry", { kind: item.kind, attempts: item.attempts, delay });
        }
        // Stop the drain on first failure so we don't hammer a flaky network.
        break;
      }
    }
  } finally {
    running = false;
  }
}

/** Mount once at app root: drain on every online transition. */
export function installMutationQueueRunner(): () => void {
  const onOnline = () => { void runQueue(); };
  window.addEventListener("online", onOnline);
  // Capacitor resume doesn't always re-fire "online" — drain explicitly.
  window.addEventListener("app:resumed", onOnline);
  // Schedule periodic drain to honour backoff timers even without an online event.
  const tick = window.setInterval(() => { void runQueue(); }, 5_000);
  void runQueue();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("app:resumed", onOnline);
    window.clearInterval(tick);
  };
}

/** React helper: count of pending items (for a "syncing N" badge). */
export function usePendingMutationCount(): number {
  const [n, setN] = useState<number>(() => read().length);
  useEffect(() => {
    const refresh = () => setN(read().length);
    // Was setInterval(refresh, 2000) — that fired a sync localStorage read +
    // JSON.parse every 2s for the entire app session (this hook is mounted in
    // layout headers). On low-RAM Android that was a constant drip of main-
    // thread jank. Now: 30s sanity poll + event-driven refresh.
    const id = window.setInterval(refresh, 30_000);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  return n;
}

/** Inspect the dead-letter queue. Surface in Settings for manual retry/delete. */
export function getDeadLetterQueue(): QueuedMutation[] {
  return readDlq();
}

/** Move a DLQ item back to the active queue for one more try. */
export function retryDeadLetterItem(id: string): void {
  const dlq = readDlq();
  const item = dlq.find((q) => q.id === id);
  if (!item) return;
  writeDlq(dlq.filter((q) => q.id !== id));
  const items = read();
  items.push({ ...item, attempts: 0, nextAttemptAt: Date.now(), lastError: undefined });
  write(items);
  void runQueue();
}

/** Permanently delete a DLQ item. */
export function deleteDeadLetterItem(id: string): void {
  writeDlq(readDlq().filter((q) => q.id !== id));
}
