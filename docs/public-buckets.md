# Storage Bucket Privacy Inventory

Source: audit `docs/AUDIT-2026-07-15-r2.md` finding H-1 (`#6`).
Rule: **no bucket may be `public=true` unless it is listed here with rationale.**

## Classification

| Bucket | Privacy | Reason | Access pattern |
| --- | --- | --- | --- |
| `chat-attachments` | **PRIVATE** | User-to-user private DMs. | `createSignedUrl(path, 300)` per fetch |
| `receipts` | **PRIVATE** | Payment receipts, PII. | `createSignedUrl(path, 600)` per fetch |
| `content` | **PRIVATE (mixed)** | Contains paid course thumbnails + lesson media. Public marketing thumbs should be moved to `hero-banners` if needed. | `createSignedUrl(path, 3600)` |
| `notices` (private/*) | **PRIVATE** | Internal announcements. | `createSignedUrl(path, 600)` |
| `hero-banners` | PUBLIC-OK | Marketing landing images, no PII. | `getPublicUrl` acceptable |
| `books` | PUBLIC-OK | Book cover thumbnails only; PDFs served through `pdf-proxy`. | `getPublicUrl` acceptable |

## Callsites to repoint (from grep)

| File:line | Bucket | Action |
| --- | --- | --- |
| `src/pages/Messages.tsx:221` | `chat-attachments` | signed URL |
| `src/components/chat/ChatWidget.tsx:257` | chat bucket | signed URL |
| `src/pages/Admin.tsx:406,458` | `content` (thumbnails) | signed URL or move to `hero-banners` |
| `src/pages/AdminUpload.tsx:442` | `content` | signed URL |
| `src/components/admin/ContentDrillDown.tsx:236,1009` | `content` | signed URL |
| `src/hooks/useBooks.ts:84,130` | `books` | keep `getPublicUrl` (public-ok) |
| `src/hooks/useNotices.ts:99` | notices | signed URL |
| `src/components/admin/HeroBannerManager.tsx:117` | `hero-banners` | keep `getPublicUrl` (public-ok) |
| `src/lib/resolveContentUrl.ts:89,127` | fallback | signed URL fallback |
| `src/pages/LessonView.tsx:1638` | lesson bucket | signed URL |

## Migration plan

1. `UPDATE storage.buckets SET public = false WHERE id IN ('chat-attachments','receipts','content','notices');`
2. Verify `storage.objects` RLS allows the owning role to `createSignedUrl` (owner + admin + teacher).
3. Repoint callers listed above.
4. Playwright regression: signed-out `supabase.storage.from('<bucket>').list('')` must error for every PRIVATE row.

## Regression guards

- CI: `rg -n "getPublicUrl\(" src/` output must equal an allow-list (books + hero-banners callsites only).
- Playwright `e2e/private-buckets.spec.ts` — one assertion per PRIVATE bucket.
