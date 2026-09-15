---
name: sentry-triage
description: Triage a Sentry breadcrumb/issue export (markdown or JSON) shared by the user, classify every unresolved issue with root-cause hypotheses, and produce a prioritized fix plan against this codebase. Trigger when the user pastes a Sentry issues list, uploads a Sentry breadcrumb export, or asks to "analyze my Sentry errors".
---

# Sentry Triage

Turn a raw Sentry export into an actionable, code-linked fix plan. Combine breadcrumbs + issue list + repo grep to name the exact file:line that emits each error.

## When to trigger

- User uploads a Sentry breadcrumb table (markdown with `Timestamp | Type | Category | Level | Message | Data` header) or JSON export.
- User pastes / screenshots the Sentry Issues page and asks to fix.
- User says "analyze Sentry", "17 errors in Sentry", "resolve all Sentry errors", "why is Sentry noisy".

## Inputs to gather

1. **Breadcrumb export** (markdown/JSON) — the source of truth for URL + status + timing + user context.
2. **Issues list screenshot or CSV** — gives event counts (frequency = priority).
3. **Time window** — default last 14D; ask if unclear.
4. **Env** — prod / preview / all; filter noise from admin devtools (Eruda).

## Workflow

### 1. Parse & bucket

Read the breadcrumb file with `code--exec` (never paste raw contents into chat — files are huge). Extract unique exceptions:

```bash
grep -oE '"type":"[^"]+","value":"[^"]+"' <file> | sort -u
```

Extract non-2xx REST calls and edge-function failures:

```bash
grep -E "status_code\":[45]" <file> | grep -oE 'https://[^"]+' | sort | uniq -c | sort -rn | head
```

Bucket every issue into one of:

- **SEC/AUTHZ** — 401/403, `permission denied`, missing GRANT, RLS violation, exposed key
- **DATA** — 400 schema mismatch, missing column/table, FK/unique violation, invalid enum
- **RELY** — 5xx, network drop (`Failed to fetch`), timeouts, native plugin errors
- **PERF** — slow query breadcrumbs (`measure:*` > threshold), N+1 patterns
- **OBS** — duplicate reports (same error via console.error AND throw), empty `{}` error objects, dev-tool noise (Eruda, source-map errors)
- **UX** — user-visible surface glitches captured as errors (invalid PDF, empty state crash)

### 2. Root-cause each issue against the repo

For every unique error, run a targeted grep to find the emitter:

```bash
rg -n "<error message substring>" src/ supabase/functions/
```

Trace one hop up the call stack. If you can't find the emitter in 2 greps, mark **UNMAPPED** — never fabricate.

For 400s against `rest/v1/<table>`, cross-check `src/integrations/supabase/types.ts` and `supabase/migrations/` — most 400s are schema drift (column missing in prod, or client sending a column the migration hasn't shipped yet).

For 42501 (`permission denied`), check for missing `GRANT` on the offending table/function. Cite the fix migration line.

For pdf.js errors (`InvalidPDFException`, `DataCloneError`, `Unexpected server response (0)`), check `FastPdfReader.tsx` + `useLocalPdfSource.ts` for content-type validation and ArrayBuffer transfer safety.

For `Failed to fetch`, check `navigator.onLine` handling, Sentry's own fetch instrument, and Eruda's fetch wrapper (admin only — usually filterable, not fixable).

### 3. Prioritize

Sort by severity × event-count:

| Score | Rule |
|-------|------|
| P0 | CRITICAL SEC/DATA (privilege escalation, data loss, dashboard dead for a role class) — ship before next tag |
| P1 | HIGH RELY/DATA (>5 events OR user-visible) — this sprint |
| P2 | MEDIUM OBS/UX — backlog |
| P3 | LOW noise (dev-tool wrappers, third-party) — filter in Sentry `beforeSend` |

### 4. Output — required format

Write to `docs/observer/YYYY-MM-DD-sentry-triage.md`:

1. **Summary table** — one row per unresolved issue: Sentry ID, type, short message, event count, root cause, severity, category, fix owner (file path or "edge fn logs" or "migration").
2. **Breadcrumb-only warnings** table — repeated non-2xx that never surfaced as an issue but are actionable.
3. **Priority-ordered fix plan** — P0/P1/P2 sections with concrete file:line references.
4. **Wins** — what's already done right (don't just list problems).
5. **Open questions** — for the human (migration state, intended role, retry policy).

### 5. Do NOT

- Do NOT auto-fix P0 SEC items without approval — GRANT changes and RLS edits need explicit sign-off.
- Do NOT paste base64 data URLs, JWTs, or user IDs from the breadcrumb export into chat or the report — redact to `<uid>`, `<token>`.
- Do NOT claim "fixed" for anything you didn't verify with a re-grep + type check.
- Do NOT dedupe issues on message alone — same message from two files is two bugs.

## Combining with other skills

- **senior-architect-audit** — apply its 12-category lens when categorizing; a Sentry issue is often a symptom of a MAINT/RELY defect the audit would have caught.
- **console-error-triage** — for `[error] ...` console logs mirrored in Sentry (typical double-report pattern).
- **supabase-architect-auditor** — for every 42501 / 400 on `rest/v1/*` → run the linter and check migration order.
- **red-team-security-audit** — if the export contains any auth error, token in a URL, or CORS failure.

## Done when

- Report written at `docs/observer/YYYY-MM-DD-sentry-triage.md` in the exact format above.
- Every issue has a file:line **or** a documented UNMAPPED reason.
- P0 items surfaced to user for approval; P2/P3 handled or filed.
- Closing reply names the skill: "Used the sentry-triage skill."
