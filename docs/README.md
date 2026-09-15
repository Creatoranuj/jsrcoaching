# Safar English Docs Index

These files are documentation only. They do not run in the website bundle, do not affect the landing page, and do not increase the APK size unless you manually package docs somewhere else.

> **Full end-user + admin manuals:** see [`manuals/`](./manuals/README.md) — `USER-MANUAL.md` (students) and `ADMIN-MANUAL.md` (admins/teachers).

| File | Purpose | Runtime impact |
|---|---|---|
| `APK-BUILD-GUIDE.md` | How to build and distribute the Android APK with Capacitor. | None |
| `BUNNY-VIDEO-PLAYER-GUIDE.md` | Bunny Stream upload, domain security, and player usage notes for lesson videos. Keep it if Bunny CDN is used. | None |
| `GROUND-LEVEL-REPORT.md` | Architect audit of web/APK performance, security, and store readiness. | None |
| `IOS-SETUP.md` | Future iOS setup notes for Xcode, Universal Links, and splash assets. | None |
| `QA-AUDIT.md` | Older QA/testing audit notes. Some branding may be stale. | None |
| `REPLIT_SETUP.md` | Replit web-preview setup; not for APK builds. | None |
| `SECURITY_CHECKLIST.md` | Rules for keeping secrets out of frontend/browser code. | None |
| `SKILLS.md` | Release/debug workflow reference for web and native builds. | None |
| `STORE-READINESS.md` | Play/App Store readiness roadmap and compliance notes. | None |
| `TESTING.md` | Unit/E2E/RLS/load test reference. Some older branding may be stale. | None |

If deployment fails, check Vercel/GitHub build logs and `package.json`/`package-lock.json` first; deleting these docs will not fix a runtime or install problem.