/**
 * One-time migration: the old localStorage "link shelf" → real library items.
 *
 * Links used to live in `nb_pl_links`, outside the folder system. They are now
 * ordinary PersonalItems (URL-backed), so they gain folders, move, reorder,
 * sort, multi-select and search. Runs once, guarded by a flag; safe to call on
 * every mount.
 */
import { listSavedLinks } from "./linkSources";
import { itemDB } from "./personalLibraryDB";
import { safeGet, safeSet } from "./storage";

const FLAG = "nb_pl_links_migrated_v1";
const SHELF_KEY = "nb_pl_links";
export const LINKS_FOLDER = "Links";

export async function migrateLegacyLinkShelf(): Promise<number> {
  if (safeGet(FLAG)) return 0;
  let rows: ReturnType<typeof listSavedLinks> = [];
  try {
    rows = listSavedLinks();
  } catch {
    rows = [];
  }
  if (!rows.length) {
    safeSet(FLAG, "1");
    return 0;
  }

  const { getOrCreateFolder, addLinkToFolder } = await import("../services/personalLibrary");
  let folderId: string | null = null;
  let migrated = 0;

  for (const row of rows) {
    try {
      // Already downloaded → the item exists; nothing to recreate.
      if (row.offline_item_id) {
        const rec = await itemDB.get(row.offline_item_id).catch(() => undefined);
        if (rec) continue;
      }
      if (!folderId) folderId = (await getOrCreateFolder(LINKS_FOLDER)).id;
      await addLinkToFolder(folderId, {
        url: row.url,
        title: row.title,
        source: row.source,
        kind: row.kind,
      });
      migrated++;
    } catch {
      /* skip a bad row rather than blocking the whole migration */
    }
  }

  safeSet(FLAG, "1");
  try {
    localStorage.removeItem(SHELF_KEY);
  } catch {
    /* ignore */
  }
  return migrated;
}
