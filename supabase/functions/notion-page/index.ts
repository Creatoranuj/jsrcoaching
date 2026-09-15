// Notion public-page proxy. Fetches recordMap for a public Notion page so we
// can render it in-app via react-notion-x. Returns JSON only (small payload,
// ~30-80 KB per page), unlike pdf-proxy which streams binary.
//
// Why server-side: notion.so/api/v3 does not allow cross-origin requests from
// arbitrary browsers. A 1-shot JSON proxy is the lightest possible bridge.
//
// Endpoint: GET /notion-page?id=<pageId-with-or-without-hyphens>
import { NotionAPI } from "npm:notion-client@7.1.5";
import { buildCorsHeaders } from "../_shared/cors.ts";

const PAGE_ID_RE = /^[0-9a-f]{32}$/i;

/** Normalise a page id: strip hyphens, lowercase. */
function normalizeId(raw: string): string | null {
  const stripped = raw.replace(/-/g, "").toLowerCase();
  if (!PAGE_ID_RE.test(stripped)) return null;
  // Notion expects hyphenated UUID form
  return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
}

const notion = new NotionAPI();

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) {
      return new Response(JSON.stringify({ error: "missing id param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pageId = normalizeId(rawId);
    if (!pageId) {
      return new Response(JSON.stringify({ error: "invalid page id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recordMap = await notion.getPage(pageId);

    // Backfill any block ids that are referenced anywhere in the recordMap
    // (content arrays, collection_query rows, format covers, subpage links,
    // synced-block source ids, etc.) but weren't returned by getPage. The
    // previous version only scanned `value.content`, which is why DPP /
    // Notes pages that store children inside collections (database views)
    // kept logging "missing block 36d8ce59-…" and rendered blank.
    //
    // Strategy: regex every 32-hex UUID out of the serialized recordMap,
    // diff against known block ids, fetch the missing ones in chunks of 100
    // (Notion's per-call cap), and loop a few passes because newly fetched
    // blocks may themselves reference more children.
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    try {
      for (let pass = 0; pass < 4; pass += 1) {
        const known = new Set(Object.keys(recordMap.block || {}));
        // Serialize once per pass. ~50-200KB; cheap compared to a getBlocks RTT.
        const serialized = JSON.stringify(recordMap);
        const referenced = new Set<string>();
        for (const match of serialized.matchAll(UUID_RE)) {
          referenced.add(match[0].toLowerCase());
        }
        const missing = [...referenced].filter((id) => !known.has(id));
        if (missing.length === 0) break;
        // Notion getBlocks is capped at 100 ids per call.
        for (let i = 0; i < missing.length; i += 100) {
          const chunk = missing.slice(i, i + 100);
          const fetched = await notion.getBlocks(chunk);
          Object.assign(recordMap.block, fetched.recordMap.block);
        }
      }
    } catch (backfillErr) {
      console.warn("[notion-page] backfill failed", backfillErr);
    }

    // ── Signed file URLs ────────────────────────────────────────────────
    // Notion serves uploaded files (PDF attachments, images) only through
    // short-lived signed URLs. `getPage` returned `signed_urls: {}` for pages
    // that store files in the newer `attachment:<id>:<name>` form, so the PDF
    // a lesson points at rendered as nothing. Sign every file-bearing block
    // ourselves and merge the result back into the recordMap, and surface the
    // PDF/file blocks separately so the client can open them in the normal
    // pdf.js reader instead of an inline embed.
    const FILE_BLOCK_TYPES = new Set(["pdf", "file", "image", "video", "audio"]);
    const EMBED_BLOCK_TYPES = new Set(["external_object_instance", "embed", "bookmark"]);
    const fileBlocks: { id: string; type: string; name: string; source: string }[] = [];
    const embedded: { id: string; name: string; url: string }[] = [];
    for (const [id, entry] of Object.entries(recordMap.block ?? {})) {
      // notion-client wraps values as { value } or { value: { value } }.
      const raw = (entry as { value?: unknown })?.value as
        | { value?: Record<string, unknown> }
        | Record<string, unknown>
        | undefined;
      const value = ((raw as { value?: Record<string, unknown> })?.value ?? raw) as
        | Record<string, unknown>
        | undefined;
      const type = value?.type as string | undefined;
      const props = (value?.properties ?? {}) as Record<string, unknown>;
      const format = (value?.format ?? {}) as Record<string, unknown>;
      if (type && EMBED_BLOCK_TYPES.has(type)) {
        // Notion "embed a Drive/Docs file" blocks keep the real link in
        // `format.original_url` (or `properties.source` for bookmarks).
        const original =
          (format.original_url as string | undefined) ||
          (format.display_source as string | undefined) ||
          (props.source as string[][] | undefined)?.[0]?.[0];
        if (original && /^https?:/i.test(original)) {
          embedded.push({
            id,
            name: (props.title as string[][] | undefined)?.[0]?.[0] ?? "",
            url: original,
          });
        }
        continue;
      }
      if (!type || !FILE_BLOCK_TYPES.has(type)) continue;
      const source = (props.source as string[][] | undefined)?.[0]?.[0];
      if (!source) continue;
      const name = (props.title as string[][] | undefined)?.[0]?.[0] ?? "";
      fileBlocks.push({ id, type, name, source });
    }

    recordMap.signed_urls = recordMap.signed_urls ?? {};
    const needsSigning = fileBlocks.filter(({ source }) =>
      /^attachment:/i.test(source) ||
      /secure\.notion-static\.com|prod-files-secure|file\.notion\.so|s3\.us-west-2\.amazonaws\.com/i.test(source)
    );
    if (needsSigning.length > 0) {
      try {
        const signed = await notion.getSignedFileUrls(
          needsSigning.map(({ id, source }) => ({
            url: source,
            permissionRecord: { table: "block", id },
          })),
        );
        const urls: string[] = signed?.signedUrls ?? [];
        needsSigning.forEach((block, i) => {
          const signedUrl = urls[i];
          if (!signedUrl) return;
          recordMap.signed_urls[block.id] = signedUrl;
          block.source = signedUrl;
          // react-notion-x reads images from `format.display_source`; leaving
          // the raw `attachment:` value there renders a broken image.
          const entry = recordMap.block[block.id];
          const raw = (entry as { value?: unknown })?.value as Record<string, unknown> | undefined;
          const value = ((raw as { value?: Record<string, unknown> })?.value ?? raw) as
            | Record<string, unknown>
            | undefined;
          const fmt = value?.format as Record<string, unknown> | undefined;
          if (fmt && typeof fmt.display_source === "string") fmt.display_source = signedUrl;
        });
      } catch (signErr) {
        console.warn("[notion-page] signing failed", signErr);
      }
    }

    // ── Link-only documents ───────────────────────────────────────
    // Many teacher pages are not file blocks at all: they are an image or a
    // single line of text linking out to the real file ("neeche image par click
    // karke download karein"). Notion keeps those URLs in rich-text link
    // annotations (`["a", url]`) or in `format.link` on an image block, so
    // neither the file-block scan nor the embed scan above found them and the
    // lesson silently degraded to "Web page" mode. AUDIT 2026-09-08.
    const DOC_URL_RE =
      /(drive\.google\.com|docs\.google\.com|\.pdf(?:[?#]|$)|cdn\.jsdelivr\.net|archive\.org|prod-files-secure|secure\.notion-static\.com|file\.notion\.so|s3\.us-west-2\.amazonaws\.com)/i;
    const linked: { id: string; name: string; url: string }[] = [];
    const seenLinked = new Set<string>();
    for (const [id, entry] of Object.entries(recordMap.block ?? {})) {
      const raw = (entry as { value?: unknown })?.value as
        | { value?: Record<string, unknown> }
        | Record<string, unknown>
        | undefined;
      const value = ((raw as { value?: Record<string, unknown> })?.value ?? raw) as
        | Record<string, unknown>
        | undefined;
      if (!value) continue;
      const props = (value.properties ?? {}) as Record<string, unknown>;
      const format = (value.format ?? {}) as Record<string, unknown>;
      const candidates: string[] = [];
      // Rich-text link annotations across every text-bearing property.
      for (const prop of Object.values(props)) {
        if (!Array.isArray(prop)) continue;
        for (const segment of prop as unknown[]) {
          if (!Array.isArray(segment)) continue;
          const annotations = segment[1];
          if (!Array.isArray(annotations)) continue;
          for (const annotation of annotations as unknown[]) {
            if (!Array.isArray(annotation)) continue;
            if (annotation[0] === "a" && typeof annotation[1] === "string") {
              candidates.push(annotation[1] as string);
            }
          }
        }
      }
      // Image / caption blocks can carry the download target on the format.
      for (const key of ["link", "bookmark_url", "original_url"]) {
        const v = format[key];
        if (typeof v === "string") candidates.push(v);
      }
      const name = (props.title as string[][] | undefined)?.[0]?.[0] ?? "";
      for (const candidate of candidates) {
        if (!/^https?:/i.test(candidate)) continue;
        if (!DOC_URL_RE.test(candidate)) continue;
        if (seenLinked.has(candidate)) continue;
        seenLinked.add(candidate);
        linked.push({ id, name, url: candidate });
      }
    }

    // Documents the reader can open directly, best first. The client opens
    // `bestDocument` in the normal pdf.js reader instead of the page view.
    const documents: { id: string; name: string; url: string }[] = [];
    const seenDoc = new Set<string>();
    const pushDocs = (list: { id: string; name: string; url: string }[]) => {
      for (const doc of list) {
        if (!doc.url || seenDoc.has(doc.url)) continue;
        seenDoc.add(doc.url);
        documents.push(doc);
      }
    };
    pushDocs(
      fileBlocks
        .filter((b) => b.type === "pdf" || b.type === "file")
        .map(({ id, name, source }) => ({ id, name, url: source })),
    );
    // Drive / Docs / direct-PDF embeds are documents too — the app's own
    // URL router knows how to turn each of these into PDF bytes.
    pushDocs(embedded.filter(({ url }) => DOC_URL_RE.test(url)));
    pushDocs(linked);

    return new Response(
      JSON.stringify({ recordMap, documents, bestDocument: documents[0] ?? null }),
      {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Edge cache: Notion pages change rarely, but signed file URLs expire
        // in ~1 hour, so the cache window must stay well under that.
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=900",
        "CDN-Cache-Control": "public, max-age=900, stale-while-revalidate=900",
        "Cache-Tag": `notion:${pageId}`,
        },
      },
    );
  } catch (err) {
    console.error("notion-page error:", err);
    return new Response(JSON.stringify({ error: "Upstream fetch failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// redeploy touch 2026-08-01
