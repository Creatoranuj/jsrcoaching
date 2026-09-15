# Observer — 2026-07-16 — Remaining Work Executed (P1.A + P2.A + P2.B)

## Shipped this turn (build mode)

### P1.A — pdf-proxy 401 retry-with-refresh ✅
- **New:** `src/lib/pdfProxyAuthRetry.ts` (~80 LOC)
  - `fetchWithAuthRetry(url, init)` — behaves like `fetch` for non-pdf-proxy URLs.
  - On `pdf-proxy` 401: calls `supabase.auth.refreshSession()` once (module-level in-flight promise dedupes concurrent callers), rewrites the `?token=` param, retries.
  - Emits `pdf/pdf-proxy:401-refresh` + `pdf/pdf-proxy:retry` Sentry breadcrumbs.
  - On refresh failure → returns original 401 (classified as `Unauthorized` by `pdfErrors.ts`).
- **Wired into:** `src/hooks/useLocalPdfSource.ts` — both `fetch()` calls in `fetchBlobWithTimeout` now go through `fetchWithAuthRetry`. Existing 401/403/408/410/425/429/5xx one-shot cache-bypass retry preserved (runs AFTER the auth-refresh retry).
- **Tests:** `src/test/pdfAuthRetry.test.ts` — 5 tests, all green:
  - 2xx passthrough (no refresh)
  - non-pdf-proxy 401 (no refresh)
  - pdf-proxy 401 → refresh → 200 (token rewritten)
  - 3 concurrent callers → **1** refresh call (dedup verified)
  - refresh failure → original 401 surfaces

### P2.A — OOM CI regression guard ✅
- **New:** `src/test/nbDownload-memory.test.ts` — 4 static-analysis tests:
  - `NATIVE_INLINE_READ_MAX_BYTES` ≤ 40 MB
  - `resolveNbDownloadSource` still branches on size cap → `streamUrl`/`convertFileSrc`
  - `readNativeFileAsBlob` still stat-gates inline reads
  - no unguarded `new Uint8Array(<size-like var>)` allocations (whitelists only the safe view-over-existing-ArrayBuffer form)
- Prevents recurrence of the July-16 `nb-download` OOM (see `docs/observer/2026-07-16-sentry-triage-oom-nbdownload.md`).

### P2.B — `size_bytes` guard on new native inserts ✅
- **Edited:** `src/services/savedDownloads.ts`
  - New `assertHasSize(where, rec)` helper — fires a `downloads/size_bytes-missing` Sentry breadcrumb + dev-mode `console.error` whenever a native (`local_path` set, not `web-indexeddb:`) insert is missing a positive `size_bytes`.
  - Called at both native insert sites: `downloadFile` fast-path (line ~354) and `chunkedWrite` legacy path (line ~426).
  - Interface stays optional (legacy rows compat) — this is a runtime guard, not a type break.
  - Downstream code (`useLocalPdfSource.resolveNbDownloadSource`) uses `size_bytes` to pick the OOM-safe branch; missing value forces `Filesystem.stat` fallback, but now we get telemetry when it happens.

**Test result:** `bunx vitest run src/test/pdfAuthRetry.test.ts src/test/nbDownload-memory.test.ts` → **9/9 green**, 2.54s.

## Deferred to manual/next-session

### P1.B — `v1.0.30-smoke-devtools` verification tag ⏸
**Why deferred:** git state (add/commit/push/tag) is disabled in this environment per system rules. This is a **user action**:
```bash
# When ready, from your local checkout:
git pull
# bump version in package.json → 1.0.30-smoke-devtools
git tag v1.0.30-smoke-devtools
git push origin v1.0.30-smoke-devtools
```
- Watch the `signed-apk-smoke.yml` API 33 leg.
- **Green** (`Flow completed successfully`, `attempts_used=1`, `smoke_exit=0`) → revert `package.json`, cut real `v1.0.30`.
- **Red** → download `signed-smoke-logcat-api33` artifact; branch:
  - Still `driver-screenshot-null` → devtools bridge not up; add `-writable-system -selinux permissive` to `emulator-options` and retry.
  - New failure class → capture in a fresh observer doc.

### P2.C — API 28/35 hard-gate promotion ⏸
**Gated on P1.B:** flip `continue-on-error: true → false` on API 28 + 35 legs of `.github/workflows/signed-apk-smoke.yml` only after **3 consecutive green** API 33 runs.

### P3 — Long-term ⏸
- **Play Integrity attestation** — needs Play Console setup + server-side edge function scope.
- **Flake-rate dashboard** — extends `flake-trend-aggregator.yml`, non-urgent.
- **Upstream Maestro `Bitmap` null-check** — file issue against `mobile-dev-inc/maestro`.

## Skill lenses re-applied to shipped diffs
- **senior-architect-audit:** No CRITICAL/HIGH. Retry helper is small, testable, single-responsibility. OBS covered via breadcrumbs. No RLS/AUTHZ surface.
- **app-crash-shield + sentry-triage:** P1.A directly kills the `pdf-proxy` 401 → "Failed to load PDF" class; P2.A hard-caps the OOM class; P2.B adds telemetry to detect the size-missing race.
- **perf-exam-ready:** No hot-path regressions — 2xx fast path is unchanged (`fetchWithAuthRetry` returns the first response untouched on non-401).
- **supabase-architect-auditor:** Uses standard SDK `refreshSession()`, no custom RPC, no SQL. `pdf-proxy` edge function itself untouched.
- **red-team-security-audit:** Access token flows only through `URL.searchParams.set("token", …)` (never logged); refresh dedup can't leak a token cross-session; breadcrumb payload contains only `ok`/`status`.
- **console-error-triage:** Breadcrumb keys stable (`pdf/pdf-proxy:*`, `downloads/size_bytes-missing`) — grep-friendly.
- **capacitor-* / mobile-view / soft-touch / asset-optimization:** N/A — no UI/native/asset surface touched.

## Files changed this turn
- `src/lib/pdfProxyAuthRetry.ts` (new, ~80 LOC)
- `src/test/pdfAuthRetry.test.ts` (new, 5 tests)
- `src/test/nbDownload-memory.test.ts` (new, 4 tests)
- `src/hooks/useLocalPdfSource.ts` (+2 LOC — import + 2 fetch→fetchWithAuthRetry swaps)
- `src/services/savedDownloads.ts` (+20 LOC — `assertHasSize` helper + 2 call sites)
- `docs/observer/2026-07-16-remaining-work-executed.md` (this file)

**Total diff:** ~120 LOC, 4 files edited, 3 files created. Matches plan scope estimate.
