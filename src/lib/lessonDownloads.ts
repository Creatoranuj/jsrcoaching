/**
 * Lesson download queue — purely on-device.
 *
 * - SQLite holds the FIFO queue + completed entries (no Supabase Storage hit).
 * - File blob written to Capacitor Filesystem (Directory.Data) so it stays
 *   inside the app sandbox and is wiped on uninstall.
 * - Signed URL is fetched once from the existing `get-lesson-url` edge
 *   function; bytes are streamed straight from Bunny CDN to disk.
 * - Web is a no-op shim — downloads are a native-only feature.
 *
 * Wi-Fi-only toggle persisted in Capacitor Preferences (key
 * `downloads.wifiOnly`, default ON to protect student data plans).
 */
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from "@/lib/errorMessage";

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'failed';

export interface DownloadRow {
  lesson_id: string;
  title: string;
  status: DownloadStatus;
  progress: number; // 0..1
  local_path: string | null;
  bytes_total: number | null;
  error: string | null;
}

const WIFI_ONLY_KEY = 'downloads.wifiOnly';
const DIR_NAME = 'lessons';

const getCapacitorGlobal = () => (globalThis as typeof globalThis & {
  Capacitor?: { isNativePlatform?: () => boolean; convertFileSrc?: (path: string) => string };
}).Capacitor;

const isNative = (): boolean => {
  try { return getCapacitorGlobal()?.isNativePlatform?.() === true; } catch { return false; }
};

/* -------------------------------------------------------------------------- */
/* Web shim                                                                    */
/* -------------------------------------------------------------------------- */
const webShim = {
  enqueue: async (_lessonId: string, _title: string): Promise<void> => {
    throw new Error('Lesson downloads are only available in the mobile app.');
  },
  list: async (): Promise<DownloadRow[]> => [],
  remove: async (_lessonId: string) => { /* noop */ },
  getLocalUri: async (_lessonId: string): Promise<string | null> => null,
  resumePending: async () => { /* noop */ },
  setWifiOnly: async (_on: boolean) => { /* noop */ },
  getWifiOnly: async () => true,
  onProgress: (_cb: (row: DownloadRow) => void) => () => { /* noop */ },
};

/* -------------------------------------------------------------------------- */
/* Native implementation (lazy)                                                */
/* -------------------------------------------------------------------------- */
type NativeImpl = typeof webShim;
let cached: Promise<NativeImpl> | null = null;

const openNative = async (): Promise<NativeImpl> => {
  const [{ Filesystem, Directory }, { Network }, { Preferences }, sqliteMod] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/network'),
    import('@capacitor/preferences'),
    import('@capacitor-community/sqlite'),
  ]);

  const sqlite = new sqliteMod.SQLiteConnection(sqliteMod.CapacitorSQLite);
  const DB_NAME = 'naveen_offline';
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lesson_downloads (
      lesson_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      local_path TEXT,
      bytes_total INTEGER,
      error TEXT,
      enqueued_at INTEGER NOT NULL
    );
  `);

  const listeners = new Set<(row: DownloadRow) => void>();
  const emit = (row: DownloadRow) => listeners.forEach((l) => { try { l(row); } catch { /* noop */ } });

  const upsert = async (row: DownloadRow & { enqueued_at?: number }) => {
    await db.run(
      `INSERT OR REPLACE INTO lesson_downloads
         (lesson_id, title, status, progress, local_path, bytes_total, error, enqueued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT enqueued_at FROM lesson_downloads WHERE lesson_id = ?), ?))`,
      [row.lesson_id, row.title, row.status, row.progress, row.local_path, row.bytes_total, row.error,
       row.enqueued_at ?? null, row.lesson_id, Date.now()],
    );
    emit(row);
  };

  const list = async (): Promise<DownloadRow[]> => {
    const res = await db.query(`SELECT lesson_id, title, status, progress, local_path, bytes_total, error
                                FROM lesson_downloads ORDER BY enqueued_at ASC;`);
    return (res.values ?? []) as DownloadRow[];
  };

  const getWifiOnly = async (): Promise<boolean> => {
    const v = (await Preferences.get({ key: WIFI_ONLY_KEY })).value;
    return v == null ? true : v === '1';
  };
  const setWifiOnly = async (on: boolean) => { await Preferences.set({ key: WIFI_ONLY_KEY, value: on ? '1' : '0' }); };

  const fetchSignedUrl = async (lessonId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-lesson-url', { body: { lessonId } });
    if (error) throw error;
    const d = (data ?? {}) as { url?: string; signedUrl?: string };
    const url = d.url ?? d.signedUrl;
    if (!url) throw new Error('No signed URL returned');
    return url;
  };

  const downloadOne = async (lessonId: string, title: string) => {
    // Respect Wi-Fi-only preference.
    if (await getWifiOnly()) {
      const status = await Network.getStatus();
      if (status.connectionType !== 'wifi') {
        await upsert({ lesson_id: lessonId, title, status: 'paused', progress: 0,
          local_path: null, bytes_total: null, error: 'Waiting for Wi-Fi' });
        return;
      }
    }

    await upsert({ lesson_id: lessonId, title, status: 'downloading', progress: 0,
      local_path: null, bytes_total: null, error: null });

    try {
      const url = await fetchSignedUrl(lessonId);
      const localPath = `${DIR_NAME}/${lessonId}.mp4`;
      // Use downloadFile so the OS handles large streaming writes off the JS thread.
      const result = await Filesystem.downloadFile({
        url,
        path: localPath,
        directory: Directory.Data,
        recursive: true,
      } as Parameters<typeof Filesystem.downloadFile>[0]);
      const r = (result ?? {}) as { path?: string; blob?: { size?: number } };
      await upsert({
        lesson_id: lessonId, title, status: 'done', progress: 1,
        local_path: r.path ?? localPath,
        bytes_total: r.blob?.size ?? null,
        error: null,
      });
    } catch (e: unknown) {
      await upsert({ lesson_id: lessonId, title, status: 'failed', progress: 0,
        local_path: null, bytes_total: null, error: String(getErrorMessage(e) ?? e) });
    }
  };

  // Single-flight worker so we never run two downloads in parallel.
  let running: Promise<void> = Promise.resolve();
  const enqueue = async (lessonId: string, title: string) => {
    await upsert({ lesson_id: lessonId, title, status: 'queued', progress: 0,
      local_path: null, bytes_total: null, error: null, enqueued_at: Date.now() });
    running = running.then(() => downloadOne(lessonId, title));
    return running;
  };

  const remove = async (lessonId: string) => {
    const row = (await db.query(`SELECT local_path FROM lesson_downloads WHERE lesson_id = ?`, [lessonId]))
      .values?.[0] as { local_path: string | null } | undefined;
    if (row?.local_path) {
      try { await Filesystem.deleteFile({ path: `${DIR_NAME}/${lessonId}.mp4`, directory: Directory.Data }); }
      catch { /* already gone */ }
    }
    await db.run(`DELETE FROM lesson_downloads WHERE lesson_id = ?`, [lessonId]);
  };

  const getLocalUri = async (lessonId: string): Promise<string | null> => {
    const res = await db.query(
      `SELECT local_path FROM lesson_downloads WHERE lesson_id = ? AND status = 'done'`, [lessonId]);
    const path = (res.values?.[0] as { local_path?: string } | undefined)?.local_path;
    if (!path) return null;
    try {
      const uri = await Filesystem.getUri({ path: `${DIR_NAME}/${lessonId}.mp4`, directory: Directory.Data });
      return getCapacitorGlobal()?.convertFileSrc?.(uri.uri) ?? uri.uri;
    } catch {
      return null;
    }
  };

  const resumePending = async () => {
    const rows = await list();
    for (const r of rows) {
      if (r.status === 'queued' || r.status === 'paused' || r.status === 'downloading') {
        running = running.then(() => downloadOne(r.lesson_id, r.title));
      }
    }
  };

  // Re-check on network change → kick off paused items when Wi-Fi appears.
  Network.addListener('networkStatusChange', (s) => {
    if (s.connected) void resumePending();
  });

  return {
    enqueue, list, remove, getLocalUri, resumePending,
    setWifiOnly, getWifiOnly,
    onProgress: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
};

const getImpl = (): Promise<NativeImpl> => {
  if (!isNative()) return Promise.resolve(webShim);
  if (cached) return cached;
  cached = openNative().catch(() => webShim);
  return cached;
};

export const lessonDownloads = {
  enqueue: async (lessonId: string, title: string) => (await getImpl()).enqueue(lessonId, title),
  list: async () => (await getImpl()).list(),
  remove: async (lessonId: string) => (await getImpl()).remove(lessonId),
  getLocalUri: async (lessonId: string) => (await getImpl()).getLocalUri(lessonId),
  resumePending: async () => (await getImpl()).resumePending(),
  setWifiOnly: async (on: boolean) => (await getImpl()).setWifiOnly(on),
  getWifiOnly: async () => (await getImpl()).getWifiOnly(),
  onProgress: (cb: (row: DownloadRow) => void) => {
    let cleanup: (() => void) | null = null;
    void getImpl().then((impl) => { cleanup = impl.onProgress(cb); });
    return () => { cleanup?.(); };
  },
};
