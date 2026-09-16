# Perf Report — resume refresh + PDF reader chrome — 2026-09-16

**Verdict:** ship. No bundle regression, one reliability class of "stuck refreshing" removed.

## Measured (production build, `bun run build`)

| Metric | Before | After | Δ |
|---|---|---|---|
| Build time | ~6.0s | 5.98s | flat |
| `LessonView` chunk | 105.6 KB | 105.6 KB | flat |
| Initial `index` chunk | 172.9 KB | 172.9 KB | flat |
| Resume refetch scope | all queries, unbounded | active queries, 8s cap | bounded |
| Overlapping resume refetches | unbounded | 1 (single-flight) | −n |
| Reader overlay elements always painted | 1 text pill | 0 (fades out) | −1 |

Largest chunks unchanged and still lazy: `html2pdf` 935 KB (dynamic import only, from the notes renderer), `vendor-sentry` 476 KB, `vendor-pdf` 419 KB, `vendor-charts` 405 KB. `html2pdf` remains above the 250 KB gzip guidance but is never in the boot path.

## Changes applied
- (runtime) `src/App.tsx` — resume refresh is single-flight, scoped to active queries, catches errors, hard-stops after 8s so no screen can stay in a refreshing state.
- (runtime) `src/pages/LessonView.tsx` — class-PDF surface joins the existing chrome auto-hide timer; full-page affordance is an icon-only button that fades instead of repainting a labelled pill over the page.
- (backend) `GRANT UPDATE ON public.enrollments TO authenticated` — progress writes (`progress_percentage`, `last_watched_lesson_id`) were failing with `42501` on every student, which also meant repeated retry traffic against PostgREST.

## Verified
- Typecheck clean (`tsgo -p tsconfig.app.json`).
- Production build clean.
- CI on the fix commit: Typecheck & Build ✅, Unit tests + coverage ✅, signed APK build ✅.

## Follow-ups
- Measure lesson/PDF open time on a real mid-range device (needs a device run; sandbox has no browser deps installed).
- Split or defer `html2pdf` further if notes export usage stays low.
