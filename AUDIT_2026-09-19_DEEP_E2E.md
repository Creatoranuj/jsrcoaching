# JSR COACHING — Deep End-to-End Audit (2026-09-19)

Scope: read-only audit of `main` (Creatoranuj/jsrcoaching). Only change pushed this round:
`android-actions/setup-android@v3 -> @v4` in `build-apk.yml` + `maestro-android.yml` (Node 20 deprecation warning).

## Verification run
- `bun install --frozen-lockfile` — OK (1005 pkgs)
- `bun run build` — OK (9.84s)
- `check-bundle-size` — initial entry **116.7 KB** / budget 180 KB — OK
- `vitest run` — **712 passed**, 17 skipped, 0 failed (78 files)

## 1. Crash & hang hygiene — 5/5
Automated scan flagged 16 listener + 5 timer "imbalances"; each was inspected and is a **false positive**:
- `Dashboard.tsx:108` — `AbortSignal` listener with `{ once: true }`.
- `VideoWatermark.tsx` — comment only; uses `requestAnimationFrame`, no interval.
- `HeroCarousel.tsx:81-90` — interval cleared in effect teardown.
- `useScreenProtection.ts:121`, `crashShield.ts`, `sessionTracker.ts` — module-level singletons (one listener per app lifetime, `stopHeartbeat()` present).
`createObjectURL` appears in 17 files and **every one** has a matching `revokeObjectURL` — no blob leaks in PDF/notes/avatar paths.

## 2. Error reporting — 4/5
- `reportError(` 71 occurrences vs `console.error` 40 — reporting path dominates. Good.
- **Finding (low):** 22 files contain silent `catch {}` (history/`localStorage`/keyboard guards). Intentional in most cases, but `LessonView.tsx:705,721,1172` and `useAndroidBackButton.ts:300,306` swallow reader/back-navigation failures with no breadcrumb — add `reportError(e, { level: 'debug' })` there to make reader bugs diagnosable.

## 3. Mobile view — 4.5/5
- 145 `safe-area-inset` references across 72 fixed/sticky files — notch/home-bar handling is systematic.
- No arbitrary Tailwind durations; no `text-sm` inputs (no iOS zoom trap).
- **Finding (low):** 125 hardcoded colour utility hits (`bg-[#...]`, `text-white`) bypass design tokens; a theme change will miss those surfaces.

## 4. Performance — 4.5/5
- Initial entry 116.7 KB (budget 180 KB) — comfortable headroom.
- Lazy heavy chunks: `html2pdf` 256 KB (Save-as-PDF only, allow-listed), `vendor-sentry` ~476 KB, `vendor-pdf` ~419 KB, `vendor-charts` ~405 KB.
- **Finding (medium):** `vendor-sentry` is the largest non-feature chunk. Trimming integrations (replay/profiling) or loading Sentry after first paint would cut ~200-300 KB from first-run download on 3G.
- **Finding (low):** landing/course images shipped as both JPG and WebP duplicates (~1.0 MB assets total) — drop the JPG twins where WebP is served.

## 5. Backend / payments safety — 5/5
- `razorpay-webhook` verifies `x-razorpay-signature` with HMAC-SHA256 + constant-time compare **before** any write.
- Enrollment is granted only through the idempotent `complete_paid_enrollment` RPC; never from client input. `reconcile-pending-payments` re-checks Razorpay and re-uses the same RPC.
- Admin surfaces gate on `has_role(uid,'admin')` with the caller's own token *before* the service-role client is created.
- Exactly one `verify_jwt = false` (`app-download`, intentionally public redirect).
- **Finding (low):** `reconcile-pending-payments` returns `Access-Control-Allow-Origin: *`. Auth is enforced, so not exploitable, but it is the only wildcard left — pin it to the app origin for consistency.

## 6. Red-team view — 4.5/5
- `usesCleartextTraffic="false"`; no HTTP fallback.
- Deep links: `autoVerify="true"` for `https://jsrcoaching.vercel.app` + custom scheme; `assetlinks.json` present with the release SHA-256 — link hijacking closed.
- `capacitor.config.ts` `allowNavigation` is an explicit narrow host list (Google viewers, Notion, Bunny, Archive, Razorpay) — no `*.google.com` wildcard.
- 4 `dangerouslySetInnerHTML` uses: 2 are JSON-LD with `<`/`>`/`&` escaping, 1 is recharts internal, 1 (`ObsidianNotes`) passes through **DOMPurify twice** with tag allow-lists. No XSS path found.
- No `next=`/`redirect_to` open-redirect parameters in client routing.
- **Unverified (needs dashboard/DB session):** Supabase linter, RLS policy diff, slow queries — the Supabase project is not connected to this session, so the previously reported ~20 SECURITY DEFINER warnings could not be re-checked. 81 migrations declare `SECURITY DEFINER`.

## 7. CI — 4.5/5
- 17 workflows, actions pinned, no hardcoded secrets, unique build tags.
- Fixed this round: `setup-android` -> v4 (Node 24), removing the deprecation warning.
- Informational: `ubuntu-latest` migrates to Ubuntu 26 on 2026-10-19. No action required; pin `ubuntu-24.04` only if the APK build must stay byte-stable.
- Still open: `SUPABASE_ACCESS_TOKEN` secret missing, so edge-function deploy step is skipped (`app-download` undeployed; resolver falls back to the fixed latest-release APK URL).

## Final rating: **4.6 / 5 — EXCELLENT**
Deductions: Sentry bundle weight, silent catches in the reader/back paths, hardcoded colours, one wildcard CORS header, plus three items outside code:
1. Supabase Dashboard -> Authentication -> enable leaked-password protection.
2. Phone test: background the app during a video, confirm playback pauses.
3. Rs.1 Razorpay live test + webhook enrollment confirmation.
