# Smart QA Testing Guide — Signed APK

Signed APK Smoke workflow ab GREEN hai. Ye guide batata hai: **kya automate ho gaya** (aap ko wapas manually check nahi karna) aur **kya abhi bhi manual QA chahiye** (release se pehle 15-min sanity pass).

---

## ✅ Automated on every `v*` tag push (~8 min, zero clicks)

Ye 15 cheezein CI khud verify karti hai — passing tag = ye sab guaranteed hain:

### Build & Signing
1. Keystore decode + password/alias match
2. Signed release APK builds (ProGuard/R8 pass)
3. APK bytes logged (bundle-size regression detector)
4. ABI splits include emulator target

### Runtime (on real Android 13 emulator)
5. Cold boot < 90s (soft budget; warning if slower)
6. WebView init OK (no white-screen)
7. Landing screen renders ("Safar English" text visible)
8. Login screen mounts, `email`/`password` fields present
9. Real Supabase auth completes with release env vars
10. Dashboard renders post-login (session propagates)
11. Bottom nav mounts — My Courses / Downloads / Profile routes accessible
12. Profile page shows logged-in email (session persist proof)
13. Settings → Delete Account visible (Play Store policy guardrail)
14. Hardware back → exit-hint (useAndroidBackButton regression fix)
15. No `FATAL EXCEPTION` / `ANR` in logcat (crash pre-filter artifact)

### Non-blocking secondary flows (observability)
- `pdf-back.yaml` — PDF viewer back button contract
- `back-button-cold-start.yaml` — cold-start back handler race

---

## 🧪 Smart 15-minute manual QA (do this before Play upload)

Automation catches regressions in known paths. **You** catch: visual polish, payments, video, and anything with real user data.

### 1. Install & first-run (2 min)
- Download APK from GitHub Release → install on real device (not emulator).
- Fresh install (uninstall first). Confirm splash → login within 3s.
- **Why manual:** real-device GPU, notch/cutout, gesture nav — emulator doesn't cover.

### 2. Payments (3 min) — CI cannot test this
- Login → open a paid course → tap "Buy".
- Razorpay sheet opens natively (not WebView popup).
- Cancel → back to app cleanly (no orphan sheet).
- **Never** run real payment in CI; test with Razorpay test card `4111 1111 1111 1111`.

### 3. Video + PDF (3 min) — high-crash-risk surfaces
- Open any lesson video → play → seek → fullscreen → rotate → back.
- Open any class PDF → scroll 5 pages → back → confirm no crash.
- Turn on screen-recorder — should be **blocked** (student account) or **allowed** (admin `shomarnashaurya@gmail.com`).

### 4. Offline (2 min)
- Airplane mode ON → open app → cached lessons load, offline banner visible.
- Download 1 PDF while online → airplane ON → open from Downloads → renders.
- Airplane OFF → any queued action (comment, quiz answer) drains.

### 5. Push + Deep-link (2 min)
- From another device / test tool, send a deep link `https://safarenglishka.vercel.app/course/<id>`.
- Cold: kill app → tap link → correct course opens.
- Warm: app in background → tap link → route swaps without restart.

### 6. Notch / safe-area (1 min)
- Rotate to landscape once — video fullscreen should respect safe-area.
- Check bottom nav doesn't overlap gesture-bar on Pixel/OnePlus.

### 7. Sign-out + re-login (1 min)
- Profile → Sign Out → login screen loads instantly.
- Login again with different account → dashboard reflects new user.

### 8. Play Store readiness (1 min)
- Settings → "Delete Account" flow reaches confirmation screen (Play policy).
- App icon + splash correct.
- Version code + name match tag (`v1.0.17` → versionName "1.0.17").

---

## 🎯 What you get "for free" now (before → after)

| Bug class | Before (user complaint) | Now (CI catches, 8 min) |
|---|---|---|
| Keystore mismatch | Play upload rejects, 2-day loop | Red build immediately |
| ProGuard strips a class | Prod crash `ClassNotFoundException` | Smoke crash on boot |
| Supabase env typo | "Login does nothing" tickets | Auth step fails with URL in log |
| Capacitor plugin missing | Plugin call returns undefined in prod | Boot crash logged |
| Route/lazy chunk 404 | Only manifests on prod CDN | Dashboard assertion fails |
| Back button regression | Silent — users can't exit | Exit-hint assertion fails |
| Bundle bloat | Un-noticed | APK bytes in log diff |
| WebView `androidScheme` wrong | Assets don't load | Landing text missing |
| Session persist broken | Users report re-login loop | Profile step fails |
| Delete Account hidden | Play removes app | Assertion fails |
| Cold-boot regression | User complaint "slow" | `::warning` if >90s |
| ANR/native crash | Sentry after prod | `logcat-crashes.txt` artifact |

---

## 🚀 Next upgrades (optional, priority order)

- **P1 — API level matrix.** `strategy.matrix.api-level: [28, 33, 35]` → 3× runtime, covers Android 9/13/15 WebView quirks.
- **P1 — Hard perf gate.** Turn cold-boot `::warning` into `exit 1` if >120s.
- **P2 — Auto-promote to Play internal track.** Add `PLAY_SERVICE_ACCOUNT_JSON` secret + `r0adkll/upload-google-play@v1` step. Smoke green → AAB auto-uploaded.
- **P2 — Payment smoke.** Add Razorpay test-mode env → smoke buys a ₹1 test course → asserts receipt. Requires test creds in secrets.
- **P3 — Sentry release marker.** Post-smoke, POST to Sentry `/releases/` so crashes are grouped per tag.

---

## Reference

- Failure playbook: `docs/observer/2026-07-14-signed-smoke-learnings.md`
- Workflow: `.github/workflows/signed-apk-smoke.yml`
- Flows: `maestro/smoke.yaml`, `maestro/pdf-back.yaml`, `maestro/back-button-cold-start.yaml`, `maestro/offline-queue.yaml`
