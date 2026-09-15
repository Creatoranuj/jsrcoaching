#!/usr/bin/env node
/**
 * Phase 2 — Storage wipe.
 *
 * Deletes every object inside the content buckets. Rows in the database are
 * handled separately by docs/PHASE2-WIPE.md; this only clears the files.
 *
 *   export SUPABASE_URL="https://<project>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
 *   node scripts/wipe-storage.mjs         # dry run — lists what would go
 *   node scripts/wipe-storage.mjs --yes   # actually delete
 *
 * Never hardcode the service role key in this file.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKETS = (process.env.WIPE_BUCKETS ?? "content,course-videos,lecture-pdfs")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

const APPLY = process.argv.includes("--yes");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
  process.exit(1);
}

const base = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function listFolder(bucket, prefix = "") {
  const found = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const res = await fetch(`${base}/object/list/${bucket}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });

    if (!res.ok) {
      throw new Error(`list ${bucket}/${prefix} failed [${res.status}]: ${await res.text()}`);
    }

    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;

    for (const entry of page) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back with a null id.
      if (entry.id === null) {
        found.push(...(await listFolder(bucket, path)));
      } else {
        found.push(path);
      }
    }

    if (page.length < limit) break;
    offset += limit;
  }

  return found;
}

async function removeBatch(bucket, paths) {
  const res = await fetch(`${base}/object/${bucket}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) {
    throw new Error(`delete in ${bucket} failed [${res.status}]: ${await res.text()}`);
  }
}

async function main() {
  let total = 0;

  for (const bucket of BUCKETS) {
    let paths;
    try {
      paths = await listFolder(bucket);
    } catch (err) {
      console.error(`! ${bucket}: ${err.message}`);
      continue;
    }

    console.log(`\n${bucket}: ${paths.length} object(s)`);
    for (const p of paths.slice(0, 20)) console.log(`   ${p}`);
    if (paths.length > 20) console.log(`   … +${paths.length - 20} more`);
    total += paths.length;

    if (!APPLY || paths.length === 0) continue;

    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      await removeBatch(bucket, chunk);
      console.log(`   deleted ${Math.min(i + chunk.length, paths.length)}/${paths.length}`);
    }
  }

  console.log(
    APPLY
      ? `\nDone. Removed ${total} object(s).`
      : `\nDry run — ${total} object(s) would be removed. Re-run with --yes to apply.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
