# Audit: `resolveContentUrl` / storage URL resolution

Date: 2026-07-31 · Scope: `src/lib/resolveContentUrl.ts`, `src/hooks/useCourses.ts`,
`src/hooks/useResolvedContentUrl.ts`, and the storage rows they read.

**Rating: 4/5** — the signing model itself is sound (private bucket, short-lived
signed URLs, deduped logging); the failures were a data-migration remnant plus an
observability bug that mislabelled an expected state as a security event.

## Console triage table

| # | Message (first 80 ch) | file:line | Category | Verdict | Level | Action |
|---|---|---|---|---|---|---|
| 1 | `failure {code:"sign_failed", path:"thumbnails/1770459324641_0jctb.png"}` | `resolveContentUrl.ts:173,183` (batched) | OBS | Real — mislabelled | Root cause | Share the missing-object classifier with the batched path |
| 2 | `missing object (placeholder used)` | `resolveContentUrl.ts:61` | OBS | Correct, but should never fire for this path | Root cause | Stop signing foreign-project URLs at all |
| 3 | stale rows pointing at old project host | `courses` id 15, 2 × `profiles`, 1 × `books` | DATA | Real | Root cause | Data cleanup |
| 4 | 2N sequential signing round-trips on course list | `useCourses.ts:75-81` | PERF | Real | Root cause | Batch via `resolveContentUrls` |

## Findings

### [HIGH] [DATA] Storage rows point at a decommissioned Supabase project
**Where:** `courses.thumbnail_url` / `courses.image_url` (id 15), `profiles.avatar_url` × 2,
`books.cover_url` × 1.
**Evidence:** all stored as `https://yigafgqqypnzebrdlbgj.supabase.co/storage/v1/object/public/content/...`
while this project is `xvlvrbpqxqqqaeihofod`. `storage.objects` under `thumbnails/` contains
exactly one file, and it is not the referenced one.
**Why it matters:** every card render fired a doomed `createSignedUrl` round-trip and wrote a
`security_events` row, burying real policy failures in noise.
**Fix applied:** the four URLs were cleared (books' `cover_url` is `NOT NULL`, so it was set to
an empty string). The UI now shows its branded placeholder; images can be re-uploaded from the
admin panel.

### [MEDIUM] [OBS] Foreign-project URLs were signed against our bucket
**Where:** `extractContentPath`, `src/lib/resolveContentUrl.ts`.
**Why it matters:** the old matcher accepted *any* `*.supabase.co/storage/**/content/**` host,
so a row from a different project was indistinguishable from one of ours and produced a phantom
"missing object".
**Fix applied:** the host must now equal this project's ref (derived from `VITE_SUPABASE_URL`,
falling back to the client's hard-coded URL). Foreign hosts are treated as external.

### [MEDIUM] [OBS] Batched signer never classified missing objects
**Where:** `resolveContentUrls`, per-entry error branch.
**Why it matters:** every batched failure was hard-coded to `sign_failed` → `console.warn` +
a `security_events` insert, even for a known-absent file. This is why one path produced two
contradictory console lines (batched from `Courses.tsx`, single from `useCourses.ts`).
**Fix applied:** a shared `classifyStorageError()` is used by both entry points, and it now also
recognises Supabase's actual wording, `"Either the object does not exist or you do not have
access to it"` — the previous regex matched it only by accident on `does not exist`.

### [MEDIUM] [PERF] 2N sequential signing calls on the course list
**Where:** `useCourses.ts` — two sequential `await resolveContentUrl` per course inside
`Promise.all(map(async …))`.
**Fix applied:** one `resolveContentUrls` call for all image + thumbnail URLs, matching what
`Courses.tsx` and `MyCourses.tsx` already do. 60 courses → 1 storage round-trip instead of 120.

### [LOW] [MAINT] Dev-only React warning floods the console
`Warning: Function components cannot be given refs` repeats ~200× on load in dev. It originates
from the dev tagger wrapping every component and does not ship to production. Out of scope here;
noted so it isn't mistaken for app breakage during future triage.

## Wins
- `content` bucket is private with on-demand signing — no permanent public URLs for gated files.
- Failure reporting is already deduped per `(code, path)` per session, so a broken policy can't
  flood Sentry.
- `missing_object` was already downgraded to `console.info` with a placeholder fallback — the
  right call; it just wasn't reachable from the batched path.
- `useResolvedContentUrl` exposes `status` + `refetch`, so callers can render a retry affordance
  rather than a silent broken image.

## Verification
- `bunx vitest run src/test/resolveContentUrl.test.ts` — 12/12 pass, including two new cases:
  a foreign-project host resolves to `null`, and the real Supabase "does not exist / no access"
  wording classifies as `missing_object` (info, not warn).
- Playwright load of `/`, `/courses`, `/my-courses`: **0** `[resolveContentUrl]` console lines.

## Open items
- Course 15 has no cover image until an admin re-uploads one.
- One book (`Hindi Padna Sikhe`) now has a blank cover; the `NOT NULL` constraint on
  `books.cover_url` should arguably be dropped so "no cover" is representable honestly.

Used the console-error-triage and senior-architect-audit skills.
