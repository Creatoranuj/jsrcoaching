# Autoscroll smoothness + PDF crash surface + Sentry triage

Skills applied: `senior-architect-audit`, `app-crash-shield`.

## Rating: 2/5 — autoscroll below 1x is structurally broken, not just "not smooth"

Two independent bugs cancel almost all motion at 0.1x / 0.2x / 0.5x. Everything below was read in the code, not guessed.

---

## Findings — Autoscroll

### [CRITICAL] [PERF] Sub-pixel deltas are thrown away every frame
**Where:** `src/hooks/useAutoScroll.ts:113-119`, same bug in `public/pdfjs/web/nb-bridge.js`

```text
accRef.current += speed * dt;
if (accRef.current >= 0.05) {      // 0.1 already passes on frame 1
  const dy = accRef.current;
  accRef.current = 0;              // <-- residual destroyed
  el.scrollTop = min(max, el.scrollTop + dy);
}
```

At 0.1x the accumulator is `0.1` — already above the `0.05` gate — so it flushes **every frame** with a 0.1px delta and then zeroes itself. Android WebView snaps `scrollTop` to whole device pixels on read-back, so `scrollTop + 0.1` reads back identical. The residual that should have carried into the next frame was just deleted, so the page can sit still indefinitely and then lurch a whole pixel when a rounding boundary happens to land. That is exactly the "friction" felt at 0.1x/0.2x/0.5x, and why 1x and above feel fine (delta is ≥ 1px every frame).

**Fix:** stop treating `scrollTop` as the source of truth. Keep a float `posRef` as the authoritative position:
- on start / resume / detected manual scroll, seed `posRef = el.scrollTop`
- each frame `posRef += speed * dt`, clamp to `max`, then `el.scrollTop = posRef`
- if read-back drifts from `posRef` by more than ~2px the user scrolled — re-seed instead of fighting them
- delete the `>= 0.05` gate; it is the thing causing the loss

Apply the identical change inside `nb-bridge.js` for the iframe path.

### [HIGH] [PERF] `scroll-behavior: smooth` is fighting the engine
**Where:** `src/index.css:13` (`html`), `src/pages/LessonView.tsx:2183`, `src/index.css:882` (`.nb-smooth-scroll`), `src/components/lesson/LessonAttachmentsSheet.tsx:176`

Every per-frame `scrollTop` write on an element with `scroll-behavior: smooth` is interpreted as a *new smooth-scroll animation request*. Sixty overlapping animations per second is guaranteed stutter. This hits:
- `WindowAutoScrollFab`, which targets `document.scrollingElement` = `<html>`, and `<html>` has `scroll-behavior: smooth` globally
- the LessonView inline-notes reader, whose autoscroll target sets `style={{ scrollBehavior: "smooth" }}` two lines above the FAB itself

**Fix:** the engine sets `scroll-behavior: auto` inline on the target while running and restores it on stop. The CSS stays in place for normal anchor and tap scrolling.

### [HIGH] [PERF] Full DOM query on every animation frame
**Where:** `src/hooks/useAutoScroll.ts:102-112`

The Archive virtualization guard runs `el.querySelectorAll('[data-page-rendered="false"]')` plus `Array.from().find()` on **every rAF tick**, on documents with hundreds of page nodes. That forces layout and allocates a fresh array 60×/sec — a direct jank and GC-pressure source on exactly the low-end Android devices this feature targets.

It also measures `page.offsetTop` against `el.scrollTop`, but `FastPdfReader`'s pages wrapper carries a zoom `transform`, which makes it a containing block. At zoom ≠ 1 the two numbers are in different coordinate spaces, so the guard can report a permanently "pending" page and freeze autoscroll outright.

**Fix:** replace the per-frame query with a counter maintained by the existing `onRendered(pageNumber)` callback, re-checked at most every ~150ms. Measure with `getBoundingClientRect()` relative to the scroller so zoom cannot break it.

### [HIGH] [PERF] Iframe path posts 120 messages per second
**Where:** `src/hooks/useAutoScroll.ts:166-178` and `public/pdfjs/web/nb-bridge.js`

The parent posts a tick every frame and the bridge replies with an `nb-autoscroll-state` message on **every single tick** — sixty structured-clone hops in each direction. Nothing consumes the reply except the `atEnd` check.

**Fix:** the bridge replies only when `atEnd` flips, or at most every 250ms.

### [MEDIUM] [UX] 0.75x is unreachable — the picker rounds it away
**Where:** `src/components/viewer/AutoScrollFab.tsx`

- `PRESETS = [0.1, 0.2, 0.5, 1, 1.5, 2, 3, 5]` — no 0.75
- the slider uses `step={0.1}`, so it cannot land on 0.75
- `setSpeed` does `Math.round(s * 10) / 10`, so even a programmatic 0.75 **becomes 0.8**
- the readout is `speed.toFixed(1)`, which would render 0.75 as "0.8"

**Fix:** presets `[0.1, 0.2, 0.5, 0.75, 1, 1.5, 2, 3, 5]` in a 3×3 grid, slider `step={0.05}`, quantise to two decimals, and format the readout so 0.75 shows as `0.75x` while 1 stays `1x`.

### [MEDIUM] [PERF] `WindowAutoScrollFab` observes the entire document
**Where:** `src/components/viewer/WindowAutoScrollFab.tsx:30-32`

A `MutationObserver` on `document.body` with `subtree: true` fires `check()` on every DOM mutation app-wide, and `check()` reads `scrollHeight` — a forced synchronous layout. While autoscroll runs and PDF pages mount, this is a self-inflicted jank loop.

**Fix:** a `ResizeObserver` on `document.documentElement` plus the existing interval; drop the body-subtree observer.

### [LOW] [MAINT] Speed unit is mislabelled
The UI says `px/frame`, but `dt` normalises to a 60fps baseline, so the real unit is px per 16.67ms. Label-only fix.

---

## Findings — PDF crash surface (app-crash-shield)

### [HIGH] [RELY] `DataCloneError: ArrayBuffer already detached` — root cause found
**Where:** `src/components/video/FastPdfReader.tsx:442-455` vs `:994`

This is the `DataCloneError` issue in the uploaded Sentry list.

`<Document key={"pdf-" + resumeEpoch + "-" + retryNonce}>` remounts on app resume, but the `file` memo depends only on `[src, data, fallbackData]`. On resume none of those change, so the **same `copy` object** — whose ArrayBuffer the pdf.js worker already transferred and detached — is handed to a brand-new worker, and postMessage throws. The existing `byteLength === 0` guard does not help, because it only runs when the memo recomputes, and it never recomputes.

**Fix:** include `resumeEpoch` and `retryNonce` in the memo deps so a fresh copy is allocated per mount, and keep the pristine bytes in a ref that is never handed to the worker directly.

### Other Sentry issues from the screenshot, mapped to code

| Sentry issue | Likely owner | Note |
| --- | --- | --- |
| `ResponseException` 500 retrieving PDF | `pdf-proxy` edge function | needs the failing upstream URL from the event |
| `UnknownErrorException: Failed to fetch` (archive.org) | archive.org source path | third-party outage — should degrade to a retry card, not an unhandled error |
| `InvalidPDFException: Invalid PDF structure` | proxy returning an HTML error page as `application/pdf` | validate the `%PDF-` magic bytes before handing off to pdf.js |
| `Storage proxy unavailable` ×2 and `[downloadFile] native blob fallback failed` | storage PDF path | one root cause reported through three sites |
| `TypeError: network error` (unhandled) ×3 | offline / flaky network | one real event triple-reported by the console forwarder, the rejection trap and Sentry's own handler |

I want to confirm each against real event payloads before changing that code — see below.

---

## Sentry: how I fetch and resolve, and what I need from you

I cannot read your Sentry account today. There are two ways to give me access, and they lead to very different levels of automation.

**Option A — read/write API access (recommended).** Create a Sentry *Internal Integration* (Settings → Developer Settings → New Internal Integration) with scopes `project:read`, `event:read`, `issue:write`, then give me the auth token (I store it as a secret, never in code) plus your org slug and project slug (the screenshot suggests `sadguru-coaching-mobile`).

With that I can, from the sandbox: list unresolved issues, pull the full stack trace, breadcrumbs and tags for each, fix the code, and mark the issue resolved in Sentry — a real triage loop instead of screenshot guesswork.

**Option B — no token.** You export the issues as JSON/CSV from the Sentry UI, or paste individual issue permalinks. Slower, and I cannot resolve issues on your side; you would close them manually after each fix.

For the "console-error-free" goal: `src/lib/sentry.ts` already forwards every `console.error` to Sentry, dedupes bursts within 5s, and scrubs PII. The remaining noise is the same network error being reported three times through three independent handlers. I would add an error-taxonomy tag (network / pdf-source / proxy / native) at capture time so triage groups by cause rather than by which handler caught it first, and downgrade expected offline failures from `error` to `warning` so they stop counting as crashes.

---

## Scope of the code change

Files I expect to touch:
- `src/hooks/useAutoScroll.ts` — float position engine, scroll-behavior override, throttled virtualization guard
- `public/pdfjs/web/nb-bridge.js` — same float accumulator, throttled state replies
- `src/components/viewer/AutoScrollFab.tsx` — 0.75x preset, 0.05 step, two-decimal quantise, readout
- `src/components/viewer/WindowAutoScrollFab.tsx` — replace the body MutationObserver
- `src/components/video/FastPdfReader.tsx` — detached-buffer memo deps
- a test covering 0.75 selection and sub-pixel accumulation

Not in scope unless you ask: wiring the Sentry integration secret, changing `pdf-proxy`, or touching payment and auth code.

## Open question

Which Sentry route do you want — A (give me an internal-integration token so I can triage and resolve automatically) or B (you paste the issues)?