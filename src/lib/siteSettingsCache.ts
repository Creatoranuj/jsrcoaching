/**
 * Shared `site_settings` reader.
 *
 * PERF 2026-09-20: four independent hooks (menu flags, lesson flags,
 * player/reader controls, lesson chip config) each ran their own
 * `site_settings` select on mount — 3,128 calls / 92s of DB time in one
 * window on a table with a few dozen rows. The table is tiny, so one select
 * of every row, cached in-module for 30 minutes and de-duplicated while
 * in flight, serves all of them.
 *
 * Every consumer already defaults to a safe value when a key is missing, so a
 * failed read is non-fatal: the promise rejects, callers keep their defaults,
 * and the next call retries (the failure is never cached).
 */
import { supabase } from "@/integrations/supabase/client";

export type SiteSettingRow = { key: string; value: string | null };

const TTL_MS = 30 * 60 * 1000;

let cachedRows: SiteSettingRow[] | null = null;
let cachedAt = 0;
let inflight: Promise<SiteSettingRow[]> | null = null;

function fresh(): boolean {
  return cachedRows !== null && Date.now() - cachedAt < TTL_MS;
}

/** All `site_settings` rows, from cache when fresh. */
export async function loadSiteSettings(): Promise<SiteSettingRow[]> {
  if (fresh()) return cachedRows as SiteSettingRow[];
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error) throw error;
    cachedRows = (data ?? []) as SiteSettingRow[];
    cachedAt = Date.now();
    return cachedRows;
  })()
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Only the requested keys, from the same single cached read. */
export async function loadSiteSettingRows(keys: readonly string[]): Promise<SiteSettingRow[]> {
  const wanted = new Set(keys);
  const rows = await loadSiteSettings();
  return rows.filter((r) => wanted.has(r.key));
}

/** Drop the cache — call after an admin writes a setting, and in tests. */
export function resetSiteSettingsCache(): void {
  cachedRows = null;
  cachedAt = 0;
  inflight = null;
}
