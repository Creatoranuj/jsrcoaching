/**
 * Offline mirror — SQLite-backed read-through cache for key tables so the
 * native app keeps working with no network.
 *
 * Web (Lovable preview, Vercel) → no-op shim; react-query already provides
 * an in-memory cache and there is no persistent native storage we want to
 * touch from the browser.
 * Native (Android/iOS) → @capacitor-community/sqlite, opened lazily on the
 * first write/read so the web bundle never imports it.
 *
 * Shape kept intentionally generic: `mirror.put(table, id, payload)` and
 * `mirror.list(table)`. Hooks (useEnrollments, useLessons, useNotices) call
 * `put` on every successful fetch and `list` as a fallback when offline.
 */
export type MirrorTable =
  | 'cached_enrollments'
  | 'cached_lessons'
  | 'cached_lesson_pdfs'
  | 'cached_notices';

const TABLES: MirrorTable[] = [
  'cached_enrollments',
  'cached_lessons',
  'cached_lesson_pdfs',
  'cached_notices',
];

const isNative = (): boolean => {
  try {
    return (globalThis as typeof globalThis & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  } catch { return false; }
};

type DBHandle = {
  put: (table: MirrorTable, id: string, payload: unknown) => Promise<void>;
  list: <T = unknown>(table: MirrorTable) => Promise<T[]>;
  clear: (table: MirrorTable) => Promise<void>;
};

const noopHandle: DBHandle = {
  put: async () => { /* web: rely on react-query cache */ },
  list: async () => [],
  clear: async () => { /* noop */ },
};

let cached: Promise<DBHandle> | null = null;

const openNative = async (): Promise<DBHandle> => {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const DB_NAME = 'naveen_offline';
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  const ddl = TABLES.map(
    (t) => `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);`,
  ).join('\n');
  await db.execute(ddl);
  return {
    put: async (table, id, payload) => {
      await db.run(
        `INSERT OR REPLACE INTO ${table} (id, payload, fetched_at) VALUES (?, ?, ?);`,
        [id, JSON.stringify(payload), Date.now()],
      );
    },
    list: async <T = unknown>(table: MirrorTable) => {
      const res = await db.query(`SELECT payload FROM ${table} ORDER BY fetched_at DESC;`);
      const rows = (res.values ?? []) as Array<{ payload: string }>;
      // Per-row try/catch: a single corrupted SQLite blob (force-kill mid-write,
      // encoding glitch) MUST NOT take down every caller of .list(). Skip the
      // bad row and keep the rest of the mirror usable.
      const out: T[] = [];
      for (const r of rows) {
        try { out.push(JSON.parse(r.payload) as T); }
        catch { /* skip corrupted row */ }
      }
      return out;
    },
    clear: async (table) => { await db.run(`DELETE FROM ${table};`, []); },
  };
};

const getHandle = (): Promise<DBHandle> => {
  if (cached) return cached;
  cached = isNative() ? openNative().catch(() => noopHandle) : Promise.resolve(noopHandle);
  return cached;
};

export const offlineMirror = {
  put: async (table: MirrorTable, id: string, payload: unknown) =>
    (await getHandle()).put(table, id, payload),
  list: async <T = unknown>(table: MirrorTable) =>
    (await getHandle()).list<T>(table),
  clear: async (table: MirrorTable) => (await getHandle()).clear(table),
};
