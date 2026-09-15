# Screen Protection APK — Manual QA Checklist

**Build:** `com.safarenglishka.app` v1.0.54+ (post boot-baseline fix)
**Purpose:** Verify FLAG_SECURE is OFF app-wide by default, ON only in `LessonView` for students, and never ON for admins.

## Setup
- Fresh install the signed APK on a physical Android device (emulator screenshot behavior is unreliable).
- Uninstall any prior build to clear PrivacyScreen plugin state.
- Have both a student and an admin account ready.

## Cases

| # | Role    | Screen              | Action                 | Expected                                     | Pass/Fail |
|---|---------|---------------------|------------------------|----------------------------------------------|-----------|
| 1 | Student | Home / Dashboard    | Power+VolDown          | Screenshot saved, thumbnail visible          |           |
| 2 | Student | Books               | Power+VolDown          | Screenshot saved                             |           |
| 3 | Student | Course detail       | Power+VolDown          | Screenshot saved                             |           |
| 4 | Student | LessonView (video)  | Power+VolDown          | **Blocked** — black frame or "can't capture" |           |
| 5 | Student | Leave LessonView → back to Home | Power+VolDown | Screenshot saved (baseline restored)     |           |
| 6 | Admin   | LessonView (video)  | Power+VolDown          | Screenshot saved (admin bypass)              |           |
| 7 | Admin   | Any admin page      | Screen recording 10s   | Recording saves, frames visible              |           |
| 8 | Both    | Cold-start app      | Immediately screenshot Splash/Home | Screenshot saved (boot baseline OFF) |           |

## If any case fails
1. Adb logcat filter: `adb logcat | grep -iE "PrivacyScreen|screenProtection"`
2. Confirm `capacitor.config.ts` still has `PrivacyScreen: { enable: false }`.
3. Confirm `src/main.tsx` idle-boot calls `bootstrapScreenProtection()` before router mount.
4. File issue with logcat + device model + Android version.

## Memory
Rule locked at `mem://constraints/screen-protection`. Do not re-enable native default.
