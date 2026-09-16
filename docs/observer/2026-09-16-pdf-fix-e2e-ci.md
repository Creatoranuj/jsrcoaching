# Observer Report — 2026-09-16 — PDF cut-off fix, E2E suite, CI/CD pipeline

**Window observed:** turns #16…#72 (2026-09-16 08:09 → 12:56 UTC)
**Scope:** JSR Coaching (Creatoranuj/jsrcoaching) — PDF reader fix, E2E test stabilization, build + Drive/Play Console pipeline, NCERT chip fix

## Incomplete

- [ ] `PLAY_SERVICE_ACCOUNT_JSON` still invalid — *turns #67, #69, #71* — evidence: "The old value was invalid JSON with a token 'N'" / user typed literal text ("not available", 13 chars) instead of JSON — cross-checked: build 35098611829 step "🎯 Detect Play Console credentials" = `skipped` (pre-check gate working) — next action: user downloads real JSON from Play Console → Setup → API access and enters it via the secure form.
- [ ] Playwright E2E run for the fixed suite — *turn #71* — evidence: "Build + tests ka result agle message me confirm kar dunga" — run 35096067859 (sha `0598793`, pre-fix E2E edits applied) = **failure**; re-run 35098599062 (sha `ec01665`) was `in_progress` at report time — next action: confirm conclusion; if failures remain, they are selector/product drift, not secrets.

## Follow-ups deferred

- [ ] Razorpay real-money transaction test — *turn ~#51* — blocker: order `order_Tch4I0qqgsDryG` reached `created` only; needs one actual payment by the user to appear as a transaction.
- [ ] v1.7.3 verification tag — deferred until E2E run 35098599062 concludes green — blocker: CI result.

## Linked to current work

- PDF clipping fix `ec01665f8` ↔ earlier fit engine (`pdfFit.ts`, `pdfContentBox.ts`, `fitToMargins`): the escaped-underscore fix is what makes all those fit rules actually compile; `src/test/pdf-zero-gap.test.ts` now pins both. All `react-pdf__` selectors in `src/` verified escaped (rg: none unescaped).
- NCERT "View DPP" → "View" `f6c3c33a4` ↔ earlier branding pass (#23): same LectureCard label pipeline; `watchLabel` now has explicit `isNcertType` branch (LectureCard.tsx:123-125).

## Dropped

- Password rotation for the account the user pasted in chat (turn ~#49) — never confirmed by user. Treat as still unrotated until user says otherwise.

## Risks / ignored findings

- Workspace moves twice wiped `/tmp` and connector links in one day (turns #61, workspace reset note in #64): every move re-breaks Drive 403/401 loops and loses unpushed edits. Mitigation now in place (all E2E edits pushed before move), but treat un-pushed /tmp work as lost on any workspace move.
- Google Drive connector churn: uploads now depend on `GOOGLE_DRIVE_API_KEY` + `LOVABLE_API_KEY` repo secrets staying in sync with the newest connection — after a reconnect, both must be re-sealed (done 12:27, verified by build 35098611829 Drive step `success`).

## Signal-only (nothing to do)

- Build pipeline 35098611829 fully green: signed APK (v1+v2+v3), Drive upload success, GitHub Release created, bundle-size trend artifact uploaded.
- Duplicate CI runs on `f6c3c33a4` cancelled by concurrency — expected.
- Static perf lanes verified present: route-level `lazyWithRetry` (App.tsx, LessonView, Admin), `react-window` virtualization (Messages, Students, Reports, EnrollmentManager), `AbortController` in both FastPdfReader fetch paths, bundle budgets enforced (`scripts/check-bundle-size.mjs`, 250KB chunk / 180KB entry gzip).

## Notes on visibility

- Tool activity (secrets sealing, gateway calls, workflow dispatches) is NOT in the chat search index; cross-checked via GitHub API + repo files.
