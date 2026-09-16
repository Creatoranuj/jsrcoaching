# Audit: Holistic final pass — senior-architect-audit + capacitor-back-button + perf-exam-ready

**Rating: 5/5** — engineering aur design dono axes par production-grade; is pass ka ekmatra HIGH (WhatsApp number drift) fix ho gaya, koi CRITICAL nahi mila.

Date: 2026-09-16 · Release: v1.6.9 · Previous: v1.6.8 (AUDIT_BACKBUTTON_CI_CRASH_2026-09-16.md)

## Findings

### [HIGH] [DATA/UX] Do alag WhatsApp numbers live surfaces par
**Where:** `src/components/common/WhatsAppButton.tsx:5` (917388459249) vs `src/pages/Index.tsx:69` (916386474017)
**Why it matters:** ExamLanding (`WhatsAppFloat`), MyCourses (`WhatsAppButton`) aur Footer (`tel:` link) sab purane number par le ja rahe the; sirf home page ka FAB sahi number kholta tha. Students ke messages do alag numbers par split ho rahe the.
**Fix:** `WHATSAPP_NUMBER` ko canonical `916386474017` kiya — ek hi constant se teeno surfaces theek. `WhatsAppFloat` already `WhatsAppFab` ka thin wrapper hai, isliye native-open behaviour, haptics aur safe-area sab consistent rahte hain.

### [LOW] [MAINT] `as any` in AdminLogin role RPC
**Where:** `src/pages/AdminLogin.tsx:27,54`
**Why it matters:** `_role: 'admin' as any` generated types ka enum gap hai; role check khud server-side `has_role` security-definer RPC se hota hai — AUTHZ sound hai, sirf typing ka nit.
**Fix:** generated Supabase types refresh hone par khud resolve ho jayega; backlog.

### [LOW] [OBS] 166 direct `console.*` calls
**Why it matters:** crashShield ke 5 calls intentional diagnostics hain (warn/error, OOM/reload breadcrumbs) — untouched. Baaki ~161 general debugging hain; sensitive auth/payment files me koi `console.*` nahi mila.
**Fix:** backlog — `reportError` pipeline me gradual migration.

## Category sweep (12 lenses)

- SEC / AUTHZ: roles `user_roles` + `has_role` RPC; admin login server-verified; koi client-side role trust nahi. OK
- DATA: WhatsApp drift (fixed upar); baaki OK
- PERF: bundle gate green — initial entry 115KB gzip (budget 180KB); html2pdf 256KB lazy exception documented; PDF streaming + sentinel contracts intact. OK
- RELY: crashShield heartbeat/reload-cooldown, ErrorBoundary auto-recovery, useResumeRecovery — leak sweep clean (createObjectURL/revokeObjectURL aur setInterval/clearInterval balanced). OK
- UX / A11Y: WhatsAppFab 56px target, haptics, aria-labels; NCERT chip existing StudyMaterialsList/DocumentReader sentinel overlays se guzarta hai. OK
- OBS: crashShield breadcrumbs + reportError surfaces intact. OK
- MAINT: god components (LessonView ~31KB chunk) known, acceptable; WhatsApp components ab ek constant par. OK
- CONFIG: version drift theek (package.json 1.6.6 → 1.6.9, tags ke saath align). `sadguruclasses` ke bache references sirf comments + retired-host rejection test me hain — intentional. OK
- VIS / MOT: is cycle me koi visual surface change nahi hui; WhatsAppFab pehle se Lovable-reference pattern (single filled FAB, ghost elsewhere) match karta hai. N/A — verified against prior audit.

## capacitor-back-button checklist

- [x] Single `backButton` listener (sirf `useAndroidBackButton.ts`, module-level guard)
- [x] Overlay sentinel contract: PDF (`pdfFullscreen`), video (`playerFullscreen`), notes/Notion/DocReaderShell — sab push + popstate close
- [x] NCERT content existing reader overlays se khulta hai — sentinel automatic cover
- [x] EXIT_ROUTES (`/dashboard`, `/`, `/index`, `/admin`) double-press → exitApp; `/install` jaan-boojh kar unmapped (public route, login bounce se bachne ke liye)
- [x] Auth-route guard + STATIC_PARENT_MAP intact

## perf-exam-ready gates

- [x] Bundle gate: `check-bundle-size.mjs` OK (115KB initial)
- [x] Baseline committed: `docs/perf/BASELINE-2026-09-16.md`
- [ ] Backend slow-query lane — BLOCKED: Supabase project workspace se linked nahi

## Verification

- 685 tests passed / 17 skipped (77 files)
- tsc clean, build green (5.7s)

## Open items (user action)

1. Vercel project rename → `jsrcoaching` (recordings wala project rename mat karna)
2. Workflow edits manual (connector ko workflow-scope nahi): maestro-android.yml `set -e`, unit-tests.yml action versions
3. Release keystore SHA-256 fingerprint → `public/.well-known/assetlinks.json`
4. Supabase project link: Project Settings → Connectors → Supabase
