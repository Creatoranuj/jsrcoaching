# Admin Panel Audit — Mobile & CRUD Verification

Audit date: 2026-06-01  
Viewport tested: 480×863 (Android device class)  
Reference skills: capacitor-best-practices, capacitor-keyboard, tailwind-capacitor, safe-area-handling

Legend: ✅ works · ⚠️ partial / needs polish · ❌ broken or missing

---

## Module Matrix

| Module | Create | Read | Update | Delete | Reorder | Upload | Mobile UX |
|---|---|---|---|---|---|---|---|
| **Admin (Users / Enrollments / Settings)** | ✅ | ✅ | ✅ | ✅ (confirm dialog uses `confirm()`) | n/a | n/a | ⚠️ giant 1590-line page; tabs scroll horizontally |
| **AdminUpload** (lessons, PDFs, notes) | ✅ | ✅ | ✅ | ✅ | ✅ DnD with `TouchSensor` (delay 200ms) | ✅ Bunny + Supabase storage | ✅ touch sensors correct |
| **AdminCMS** (courses / chapters / lessons CRUD) | ✅ | ✅ | ✅ | ✅ | ❌ no DnD — position field manual | ✅ | ⚠️ no DnD on chapters/lessons |
| **AdminSchedule** (lecture schedules) | ✅ | ✅ | ❌ no edit | ✅ | n/a | n/a | ⚠️ native date/time inputs only |
| **AdminQuizManager** | ✅ | ✅ | ✅ | ✅ | ✅ DnD on questions + options with TouchSensor | ✅ question images | ✅ |
| **AdminLiveManager** | ✅ | ✅ | ❌ no edit | ✅ | n/a | n/a | ⚠️ sheet preview large on small screens |
| **AdminChatbotSettings** | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ |
| **AdminAnalytics** | n/a | ✅ | n/a | n/a | n/a | n/a | ⚠️ recharts not lazy — heavy on mobile |
| **HeroBannerManager** | ✅ | ✅ | ✅ | ✅ | ⚠️ **FIXED** — TouchSensor was missing, added in this pass | ✅ | ✅ after fix |
| **SyllabusManager** | ✅ | ✅ | ✅ | ✅ | check needed | ✅ | needs verify |
| **TimetableManager** | ✅ | ✅ | ✅ | ✅ | check needed | n/a | needs verify |
| **SocialLinksManager** | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| **ContentDrillDown** | view-only | ✅ | n/a | n/a | n/a | n/a | ✅ |

---

## Issues found & severity

### 🔴 High
1. **HeroBannerManager DnD didn't work on touch** — only `PointerSensor` registered with no activation constraint, scroll on Android consumed the gesture. ✅ **Fixed**: added `TouchSensor { delay: 200, tolerance: 5 }` + `PointerSensor { distance: 8 }`.
2. **`window.confirm()` used for destructive admin actions** (Admin.tsx revoke, multiple Trash2 handlers) — Capacitor WebView shows a system dialog that bypasses theme and is dismissable by back-button without callback. Replace with shadcn `AlertDialog`.

### 🟡 Medium
3. **AdminCMS has no drag reorder** for chapters/lessons — only manual `position` field. Add DnD parity with AdminUpload.
4. **AdminSchedule / AdminLiveManager** — no edit flow, only create+delete. Users must delete and recreate to fix typos.
5. **AdminAnalytics** loads `recharts` synchronously in the admin island — fine for desktop, ~120 KB extra for admin-mobile. Lazy-import per chart.
6. **Mobile tab strip in Admin.tsx** has many tabs; needs horizontal scroll snap + active scroll-into-view.
7. **Native `<input type="date|time">`** in AdminSchedule renders inconsistent picker on Android WebView. Consider `react-day-picker` for date.

### 🟢 Low
8. **Tap targets** — `GripVertical` handle is `p-2` (~32px) — bump to `p-3` for ≥44px.
9. **Bunny upload progress** uses XHR — verify it survives app backgrounding on Android.
10. **Forms inside `Dialog`/`Sheet`** — verify `--nb-keyboard-h` padding is applied to scroll container so submit button stays visible above keyboard.

---

## Fixes shipped this pass
- ✅ `Subscription.tsx`: outer wrapper now `min-h-screen bg-background` on both loading and paywall paths (kills white-flash).
- ✅ `HeroBannerManager.tsx`: added `TouchSensor` with proper activation delay so drag works on mobile.

## Recommended next batches
- **Batch 1 (high)**: Replace all `confirm()` calls in admin pages with `AlertDialog`. ~6 sites.
- **Batch 2 (medium)**: Add DnD reorder to AdminCMS chapters & lessons.
- **Batch 3 (medium)**: Add edit-in-place to AdminSchedule and AdminLiveManager.
- **Batch 4 (perf)**: Lazy-load `recharts` charts in AdminAnalytics; route-split per chart.
- **Batch 5 (polish)**: Keyboard-aware scroll for Dialog/Sheet forms — wrap inner content in `pb-[var(--nb-keyboard-h,0px)]`.

---

## Performance notes (perf-baseline pending real-device run)

- `app-rich` chunk correctly isolates admin/video/markdown — student bundle clean.
- `vite-imagetools` is producing `.webp` for `/landing /branding /icons /thumbnails`.
- ChatWidget already deferred via `requestIdleCallback` — good.
- Capacitor plugins all top-level imported in `main.tsx` / `App.tsx`; consider lazy chain for `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/network` since they're already wrapped in async installers.
- `allowMixedContent: true` in `capacitor.config.ts` — should be `false` unless Bunny CDN truly serves HTTP. Verify and tighten.
