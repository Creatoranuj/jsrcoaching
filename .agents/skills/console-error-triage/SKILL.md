---
name: console-error-triage
description: Systematically hunt, classify, and fix runtime console errors across the app using a single logic pipeline. Trigger when the user says "check console errors", "find errors in console", "review runtime errors", "why is this erroring", "clean up console noise", or after a QA / release / regression pass. Pairs with the Sentry forwarder in src/lib/sentry.ts so findings map 1:1 to production telemetry.
---

# Console Error Triage

Every `console.error(...)` in this app is forwarded to Sentry in production via the patched `console.error` in `src/lib/sentry.ts` (see `installConsoleErrorForwarder`). That means the console is the **canonical error surface** — a noisy console = noisy Sentry = real user-visible reliability debt.

This skill gives you one deterministic pipeline to review console errors at **all levels** (browser preview, Playwright run, `adb logcat`, Xcode console, Sentry issues) and act on them with the same logic every time.

## When to Use

- "Find errors in the console" / "why is the console spammed"
- "Review runtime errors" / post-release triage
- After adding a feature, before shipping
- When Sentry issue count spikes
- When the in-app `?debug=1` overlay (`src/lib/nativeDebug.ts`) shows red lines

## The Pipeline — apply to every error, in order

For each distinct error line, walk these six steps. Do NOT skip steps; the value is in the consistency.

### 1. Capture
Collect the raw error from **one** of these sources — pick the closest to the user:
- `code--read_console_logs` / `code--read_runtime_errors` (preview)
- Playwright run: `page.on("console", ...)` + `page.on("pageerror", ...)`
- Native: `scripts/logs-android.sh` or `scripts/logs-ios.sh`
- Sentry issue (prod)
- `?debug=1` overlay (`src/lib/nativeDebug.ts`) on device

Record: message, first stack frame, URL/route, count, first-seen.

### 2. Classify — is it real?
Match against the known-noise list before doing anything else:

| Pattern | Verdict | Action |
| --- | --- | --- |
| `AbortError` / "aborted a request" | Noise (react-query/react-notion-x unmount) | Already suppressed in `nativeDebug.ts`. If it leaks elsewhere, suppress at source, not globally. |
| `Keyboard.setResizeMode … UNIMPLEMENTED` | Noise (web fallback) | Already suppressed. Do not re-log. |
| ResizeObserver loop limit exceeded | Noise (browser quirk) | Ignore. |
| ChunkLoadError / Loading chunk N failed | Real — stale deploy | Fixed by `lazyWithRetry` (`src/lib/lazyWithRetry.ts`). Confirm the failing import uses it. |
| Supabase `PGRST116` on `.maybeSingle()` | Noise (no row) | Handle in the hook, don't `console.error`. |
| Anything else | **Real** | Continue to step 3. |

### 3. Locate — file:line
Resolve the first non-vendor stack frame to `src/**`. If the stack is minified, cross-reference by message string with `rg -n "<unique substring>" src`.

### 4. Categorize (senior-architect-audit lens)
Tag the error with one of: `SEC`, `AUTHZ`, `DATA`, `PERF`, `RELY`, `UX`, `A11Y`, `OBS`, `MAINT`, `CONFIG`. This decides who owns the fix and how urgent it is. (See the `senior-architect-audit` skill for the full rubric.)

### 5. Fix at the right level — the logic that applies everywhere
Choose the **highest** applicable level. Never fix at a lower level if a higher one is available.

1. **Root cause** — bad input, missing guard, wrong assumption. Fix the code that produced the error. This is the default.
2. **Boundary** — the error is expected from an external system (network, plugin, user cancel). Convert `console.error` → `reportError(err, { surface })` from `src/lib/sentry.ts` and handle the state (toast, retry, fallback UI).
3. **Suppression** — the error is provably noise (see step 2 table). Suppress at the **narrowest** point: the specific hook/component, not globally. Only add to the global filter in `nativeDebug.ts` when it originates outside our code (plugin, browser).
4. **Observability upgrade** — the error is real but we can't fix it now. Replace bare `console.error(err)` with `reportError(err, { surface: "<hookName>", ...context })` so Sentry gets structured context, then file a follow-up.

**Never**:
- Wrap in `try { ... } catch {}` to silence.
- Delete the `console.error` without a replacement.
- Add a broad regex to the global suppression list.

### 6. Verify
- Re-run the source from step 1 — the line must be gone (or replaced by a structured `reportError`).
- For Playwright-repro'd errors: assert `page.on("pageerror")` count is 0 in the spec.
- For prod-only errors: confirm the fix path is exercised by an existing e2e (`e2e/*.spec.ts`) or add one.

## Output Format

Produce one table per triage pass, then a fix plan. Keep it scannable.

```markdown
# Console Triage — <date / scope>

| # | Message (first 80 ch) | file:line | Category | Verdict | Level | Action |
| - | --------------------- | --------- | -------- | ------- | ----- | ------ |
| 1 | Failed to load PDF: 403 | src/hooks/useLocalPdfSource.ts:88 | RELY | Real | Root cause | Add signed-url refresh before fetch |
| 2 | AbortError: The user aborted... | (vendor) | — | Noise | Already suppressed | — |
| 3 | Cannot read properties of undefined (reading 'id') | src/pages/LessonView.tsx:214 | DATA | Real | Root cause | Guard `lesson?.id` before use |

## Fix Plan
1. #1, #3 — apply now (root cause).
2. #4 — swap `console.error` → `reportError` with `surface: "useEnrollments"`.
3. Add e2e assertion: no `pageerror` on `/lesson/:id` cold load.
```

## Project-Specific Anchors

- **Forwarder**: `src/lib/sentry.ts` → `installConsoleErrorForwarder`. Every `console.error` in prod already reaches Sentry — do not add a second forwarder.
- **Preferred helper for new code**: `reportError(err, { surface })` from `src/lib/sentry.ts`. Passes structured `extra` to Sentry.
- **Breadcrumbs**: `addBreadcrumb(category, message, data)` — use before risky ops (PDF open, payment, deep link).
- **Noise filter**: `isExpectedCapacitorNoise` in `src/lib/nativeDebug.ts`. Extend here **only** for errors originating outside our code.
- **In-app overlay**: append `?debug=1` to any route to see the last 50 console lines on device.
- **Native logs**: `scripts/logs-android.sh`, `scripts/logs-ios.sh`.
- **Legacy silent-catch sites**: `src/hooks/**`, `src/lib/**` — many still use `console.error(err)`. Because of the forwarder they now reach Sentry for free; upgrade to `reportError` opportunistically when you touch the file, not in a big sweep.

## Anti-patterns to Flag Loudly

- `catch (e) { console.error(e) }` with no user-visible state change → user sees a broken screen, Sentry sees a bare Error.
- `catch {}` (empty) → invisible failure. Always at least `reportError`.
- Broadening `isExpectedCapacitorNoise` to hide a real error.
- Adding `console.error` inside a render function → fires on every re-render, floods Sentry rate limits.
- Logging PII / tokens / full Supabase rows — Sentry will retain them. Log ids only.

## Done When

- Every real error from step 1 has a row in the table with `file:line`, category, and level.
- Root-cause fixes applied; boundary errors converted to `reportError`.
- Console re-checked and is clean (or only contains structured `reportError` calls in dev).
- Closing reply names this skill.
