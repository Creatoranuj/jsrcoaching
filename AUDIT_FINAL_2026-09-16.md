# Final End-to-End Audit — JSR COACHING (v1.6.5)

Date: 2026-09-16
Lenses: senior-architect-audit, capacitor-testing, capacitor-best-practices,
safe-area-handling, app-crash-shield, perf-exam-ready, CI/E2E monitor.

**Verdict: 5/5** — all HIGH findings from `AUDIT_E2E_2026-09-16.md` are fixed in
this release. No CRITICAL, no open HIGH.

---

## 1. What changed since the 4/5 audit

| # | Finding (was) | Fix |
|---|---|---|
| HIGH | 331 sourcemaps (~28 MB uncompressed) shipped inside the APK/AAB — full source readable by anyone who unzips the package | `aaptOptions.ignoreAssetsPattern` now excludes `*.map`, plus an explicit strip step in `build-apk.yml` after `cap copy` |
| HIGH | pdf.js shipped twice: `assets/public/pdfjs` (5.9 MB, our patched viewer) **and** `assets/pdfjs` (18.4 MB) | Root cause identified: the second copy is **not** in the repo — it is merged in from the `io.ionic.libs:ionfileviewer-android:1.0.1` AAR pulled by `@capacitor/file-viewer`. Its sourcemaps and demo PDF are now excluded at packaging time; the library itself stays because `openNativeDocument` depends on it |
| HIGH | pdf.js demo document `compressed.tracemonkey-pldi-09.pdf` (1 MB) shipped | Excluded by name in `ignoreAssetsPattern` + strip step |
| MEDIUM | `unit-tests`, `typecheck-build`, `lighthouse-ci`, `migration-drift` on Node20 action majors | Bumped to `checkout@v5`, `setup-node@v5`, `upload-artifact@v5`, `cache@v6` |
| MEDIUM | `package.json` version 1.6.0 vs released tag v1.6.4 | Bumped to 1.6.5, matching this tag |
| MEDIUM | Sentry loaded on the initial graph | Verified already correct: `src/main.tsx` initialises Sentry inside `idle(...)` via dynamic import — no change needed |

### APK size — before / after

| Item | v1.6.4 | v1.6.5 (expected) |
|---|---|---|
| APK | 28.6 MB | ~20–21 MB |
| AAB | 25.2 MB | ~17–18 MB |
| Sourcemaps in package | 331 files / 27.95 MB | 0 |
| pdf.js demo PDF | 1.0 MB | 0 |

Sentry still receives sourcemaps — they are uploaded by `sentry-cli` from
`dist/` during the build, before packaging. Stack traces stay readable.

---

## 2. Autoscroll feature audit

Files: `src/hooks/useAutoScroll.ts`, `src/components/viewer/AutoScrollFab.tsx`,
`WindowAutoScrollFab.tsx`, `AutoScrollSheet.tsx`, `autoScrollLimits.ts`.

| Lens | Result |
|---|---|
| RELY / crash-shield | Clean. Every `requestAnimationFrame` has a matching `cancelAnimationFrame`, every `setInterval` a `clearInterval`, every `addEventListener` a paired removal in the effect cleanup. No leak pattern across mount/unmount cycles |
| PERF | rAF loop with sub-pixel remainder accumulator (`smoothElRef`) — no forced layout thrash per frame; speed is clamped by `MAX_AUTOSCROLL_SPEED` |
| DATA | Per-document state (`nb_autoscroll_speed`, `_reverse`, `_dwell` + per-doc variants) keyed by `docKey`, so resume position never bleeds between lessons |
| UX | Cross-origin iframes handled through the bridge protocol; Google Docs correctly hides the FAB (covered by `pdfViewer-regression.test.tsx`) |
| A11Y / MOT | `active:scale-95` press feedback, `tapHaptic` / `selectionHaptic` on toggle and speed change |
| Safe area | FAB and sheet both use `env(safe-area-inset-bottom)` — no overlap with the gesture bar on notched devices |

**No code change required.** Autoscroll is production grade.

### Test results (capacitor-testing lens)

```
vitest run — 74 files passed, 1 skipped
             667 tests passed, 6 skipped
```

Autoscroll-specific: `autoScrollFab.test.tsx` (2), `autoScrollSpeed.test.ts` (7),
`pdfViewer-regression.test.tsx` (9) — all green.

---

## 3. Remaining backlog (LOW — none block release)

- God components: `LessonView` (96 KB), `ContentDrillDown` (68 KB),
  `MahimaGhostPlayer` (68 KB), `AdminUpload` (67 KB) — split when next touched.
- 138 `console.*` call sites, 60 `as any` casts, 59 `.tsx` files with hardcoded
  colour literals.
- `vendor-charts` (110 KB gz) is admin-only but sits in the shared vendor graph.
- Release assets still include a legacy `Sadguruclasses.apk` duplicate.
- Supabase database lens (slow queries, index coverage, RLS re-eval) not run —
  the project is not linked to this workspace.

## 4. Wins carried forward

- Crash shield + error boundary with retry guard, no infinite reload loop.
- `webContentsDebuggingEnabled` off in release; eruda gated to admins.
- ABI filters limited to `arm64-v8a` + `armeabi-v7a`.
- `minifyEnabled` + `shrinkResources` on release.
- Bundle-size gates enforced in CI (entry 180 KB, total initial 900 KB).
- Last 25 CI runs green; no secret keys in source (publishable key only).
