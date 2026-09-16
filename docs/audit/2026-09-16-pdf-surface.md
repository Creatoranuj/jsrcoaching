# Audit: PDF reader surface (FastPdfReader + fit engine + LectureCard) — 2026-09-16

**Rating: 4/5** — Engineering solid after the escaped-underscore fix (typecheck + unit + build + Drive upload green); design reads intentional on the reader itself, but the PDF entry chips (LectureCard) still lack haptics and use hover-first affordances that behave inconsistently inside the Android WebView.

Scope audited: `src/components/video/FastPdfReader.tsx`, `src/lib/pdfFit.ts`, `src/lib/pdfContentBox.ts`, `src/components/course/LectureCard.tsx`, `src/test/pdf-zero-gap.test.ts`, `public/pdfjs/web/viewer.html`, pdf-proxy edge function.

## Findings

### [MEDIUM] [MOT] No haptics on primary PDF/lesson actions
**Where:** `src/components/course/LectureCard.tsx:104-357`
**Why it matters:** Card press, bookmark xand download toggles have `active:scale` but never call Haptics — a top-tier Capacitor app per app-crash-shield/soft-touch conventions already in repo, only 3 files use Haptics globally gives light impact on selection.
**Fix:** Haptics.impact { style: ImpactStyle.Light } in the card tap handler and bookmark toggle.

### [MEDIUM] [PERF] Non-fit branch renders every visible page at container width without a render cap on low-end devices
**Where:** src/components/video/FastPdfReader.tsx:300-316 (LazyPage default branch)
**Why it matters:** IntersectionObserver limits mounting, but a fast fling can mount 5+ canvases at ~800px width each (~3-4 MB bitmap each) before release-when-distant kicks in.
**Fix (backlog):** cap concurrent renders with a 2-3 slot semaphore in LazyPage.

### [LOW] [VIS] active:scale-[0.99] vs active:scale-[0.995] mix
**Where:** LectureCard.tsx:104,153,244
**Why it matters:** two near-identical press scales = no single press language.
**Fix:** standardize on one value (0.98) across the card.

### [LOW] [A11Y] Guard test is text-assertion, not rendered-CSS
**Where:** src/test/pdf-zero-gap.test.ts:16-19
**Why it matters:** it pins the source string, so a future class rename that compiles differently could still slip. Acceptable as a tripwire; a jsdom/Tailwind compile check would be stronger.

## Category coverage
SEC: N/A — reader renders course-owned PDFs only via pdf-proxy (auth + Range forwarded, CORS exposes content-range). AUTHZ: admin checks server-side elsewhere. DATA: progress persists via usePdfResumePosition (debounced). RELY: AbortController on both fetch paths (lines 590, 694), validatePdfBlob + error state. OBS: reportError surfaces handled. MAINT: fit math isolated in pdfFit/pdfContentBox. CONFIG: budgets wired in CI.

## Wins
- Root cause (Tailwind __ xhr space) fixed everywhere: rg shows zero unescaped react-pdf__ arbitrary selectors in src/`.
- overflow-x-auto + touchAction: pan-x pan-y pinch-zoom — zoomed pages pan instead of clipping.
- CI gate: bundle budgets (250KB chunk/180KB entry gzip), design-token guard, console-usage guard all run in workflows.
- Build 35098611829: signed APK v1+v2+v3, Drive upload success, Release created; Play Console step fails closed (skips with actionable message on invalid JSON).

## Fix Plan
1. (MEDIUM) Haptics on LectureCard actions — this PR
2. (MEDIUM) render-slot semaphore — backlog before next exam season
3. (LOW) scale + guard-test hardening — backlog

## Open Questions
- None for the user; PLAY_SERVICE_ACCOUNT_JSON remains the pending credential.
