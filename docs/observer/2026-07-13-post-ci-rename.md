# Observer Report — 2026-07-13 — post CI rename + crash-shield MED fixes

**Window observed:** last session (PDF blink → crash-shield audit → CI rename)
**Scope:** `useLessonNotes` cache, `useBackgroundPresence`, `NotionPageRenderer` unmount, `.github/workflows/build-apk.yml`

## Update (2026-07-13, second pass)
- ✅ **MED-1 re-verified.** `src/components/video/NotionPageRenderer.tsx` lines 43–49 clear `revokeTimerRef` and revoke `pendingBlobUrlRef` on unmount. No regression — the earlier "already implemented" claim holds. Moved from Incomplete → Signal-only.
- ✅ **Orphan-backend gaps wired (Track B partial).**
  - `firecrawl-scrape` → "Try Firecrawl (JS-rendered)" button in `AdminChatbotSettings.tsx` (fallback for pages `crawl4ai-bridge` can't render).
  - `generate-embedding` → "Backfill embeddings" button in same page — batches 20 KB entries per click.
- ⏭️ **Skipped intentionally.**
  - `send-phone-otp` / `verify-phone-otp` — `PhoneLogin.tsx` is currently a stub ("Under construction, SMS provider migration"). Product decision, not a bug. Do NOT re-wire without confirming the MSG91 secrets + provider status.
  - `notify-ai` — is an internal trigger that turns course/lesson/material records into KB entries. Wants an auto-invocation from admin CRUD, not a manual test button. Log as fast-follow.
  - `get-video-stream` — signed-URL replacement for direct Bunny URLs. Too large for this PR (touches video player).
- 🆕 **Discovery script added.** `scripts/audit-edge-function-callers.mjs` writes `docs/observer/edge-function-caller-map.md` with orphaned / called / expected-backend-only sections. Exits 1 if orphans exist so it can gate CI later.

## Incomplete
- [ ] ~~**MED-1 verification**~~ — done, see Update.
- [ ] **MED-2 regression test missing** — `useBackgroundPresence` (60s hidden → epoch bump) has no unit or Playwright coverage. A future change could ship a stuck presence channel and no CI signal would fire.
- [ ] **CI rename not tag-tested** — build-apk.yml rewrite (SafarEnglish + tag-derived versionName + guard) has not been exercised by a real `vX.Y.Z` tag push. Push `v0.0.1-test` on green HEAD, watch it upload `SafarEnglish-v0.0.1-test.apk`, then `git push --delete origin v0.0.1-test`.

## Follow-ups deferred
- [ ] **LOW batch from perf-exam audit** — `crashShield.recovered` → Sentry breadcrumb, dev-only `queryPersister` size probe, `PlayerTest.tsx` listener cleanup.
- [ ] **PLAY_SERVICE_ACCOUNT_JSON secret** — Play Console auto-publish still skipped; workspace admin adds the service-account JSON. Step summary now surfaces the skip.
- [ ] **Single-APK release asset** — decision on collapsing `SafarEnglish-vX.Y.Z.apk` + `SafarEnglish.apk` into one download deferred to backlog.
- [ ] **`notify-ai` auto-invocation** — call it from admin course/lesson/material create paths so new records land in `knowledge_base` automatically.
- [ ] **`get-video-stream` migration** — replace direct Bunny URLs in the video player with signed-function calls.
- [ ] **`send-phone-otp` / `verify-phone-otp`** — waiting on SMS provider decision; when green-lit, wire `PhoneLogin.tsx` back (2-step: send → reveal OTP input → verify → `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`).
- [ ] **Wire audit script into CI** — add `node scripts/audit-edge-function-callers.mjs` as a soft-warning step in `dependency-audit.yml`.

## Linked to current work
- CI rename ↔ earlier `com.safarenglishka.app` package rename — the app id was already Safar English; only artifact naming had drifted. Confirms the rename was cosmetic-only, not a signing/keystore risk.
- `useLessonNotes` module cache ↔ earlier PDF popup blink fix — same "warm cache paints first frame" pattern; if we add other per-lesson hooks (quiz, DPP), reuse this shape rather than re-inventing.

## Dropped
- Slash-command skills named but not applied this session: `asset-optimization`, `capacitor-video-player-master`, `console-error-triage`, `mobile-view-Expert`, `soft-touch`, `supabase-architect-auditor`, `red-team-security-audit`. Invoke each on a scoped surface if you want them to actually run.

## Risks / ignored findings
- **APP_VERSION_NAME guard is fatal** — on a mis-typed tag (`v1.0.16a`) the regex fails, falls back to run-number, and the strict-equality guard aborts the build. Intended: emergency hotfix tags must be `vX.Y.Z` exactly.
- **`installImmersiveAutoToggle` + `useBackgroundPresence`** interaction untested — both listen on `visibilitychange`; if either throws, the other still runs (independent handlers), ordering unspecified.
- **CACHE_MAX=32 in useLessonNotes** — accepted; 33rd lesson evicts earliest. Fine for exam-week reality.

## Signal-only (nothing to do)
- **MED-1** cleanup in place at `NotionPageRenderer.tsx` L43–49.
- APK smoke check (bundle stamp + MainActivity + `@capacitor/app` class) passing consistently — good regression net for R8 stripping.
- Artifact actions already on node24 majors (`upload-artifact@v6`, `checkout@v5`, `setup-node@v5`).

## Notes on visibility
- Tool activity (file edits, YAML validation, greps) is NOT in chat search — cross-checked build-apk.yml directly. Skills named in slash-commands are visible in chat but the "applied" set can only be inferred from the reply body.

**Top 3 to close before next release tag:**
1. ~~Re-verify MED-1~~ ✅ done.
2. Push a throwaway `v0.0.1-test` tag to prove the versionName guard passes on a healthy tag.
3. Add `PLAY_SERVICE_ACCOUNT_JSON` if Play auto-publish is actually wanted this cycle.
