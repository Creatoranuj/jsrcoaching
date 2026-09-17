# Audit — old-brand cleanup + Ask-a-Doubt CORS fix — 2026-09-17

Scope: `Creatoranuj/jsrcoaching` @ main. Repo-wide scan for pre-rebrand hosts
(`safarenglishka`, `sadguruclasses`, `sadgurucoachingclasses`) and for the
founder name, plus the root cause of the lesson Ask-a-Doubt failure.

## Root cause — "Failed to send a request to the Edge Function"

`supabase/functions/_shared/cors.ts` fell back to `ALLOWED[0]` whenever the
caller's `Origin` did not match `AUTO_ALLOW_PATTERNS`. `ALLOWED[0]` came from the
`ALLOWED_ORIGINS` secret and still held the retired `safarenglishka.vercel.app`
origin, so the browser discarded every response from the live
`jsrcoaching.vercel.app` site. The student only ever saw the generic fetch
failure, followed by the AI reply "Connection में problem है".

Fix: `buildCorsHeaders` now echoes the caller's origin and never substitutes a
configured one. `_shared/auth.ts` (JWT verification) remains the security
boundary; an unrecognised origin is reported through the diagnostic
`X-Origin-Known: 0` response header instead of a broken response.
`isOriginAllowed()` is exported for callers that want to log it.

Client copy: `src/lib/aiErrorMessage.ts` gained `BLOCKED` — a Supabase
`FunctionsFetchError` ("failed to send a request") is a server-side
configuration fault and is no longer reported as the student's own internet
problem. `Failed to fetch` still maps to `OFFLINE`.

## Old-brand hosts removed

| Location | Change |
| --- | --- |
| `supabase/functions/_shared/cors.ts` | dropped `safarenglishka*` patterns; added `*.jsrcoaching.com` |
| `src/config/deepLinks.ts` | `APP_LINK_HOSTS` = `jsrcoaching.vercel.app` only |
| `src/test/deepLinks.test.ts` | `safarenglishka.vercel.app` now asserted as **rejected** |
| `android/.../AndroidManifest.xml` | removed retired App-Links host |
| `android/.../network_security_config.xml` | removed retired domain |
| `android/.../MainActivity.java` | trusted origins now `jsrcoaching.vercel.app` + `*.jsrcoaching.com` |

## Deliberately left alone (changing these breaks production)

- `storage-safarenglishka-recording.vercel.app` / `storage-naveenbharat-recording.vercel.app`
  and upstream project `hsvtagmckkfmniawflul.supabase.co` — a **separate live
  storage project** holding recordings and PDFs (`resolve-storage-pdf`,
  `pdf-proxy`, `trustedPdfHosts`). Renaming these would break every
  Telegram-backed PDF and recording.
- `@phone.safarenglishka.local` proxy e-mail in `verify-phone-otp` — the login
  identity of every existing phone-only user. Changing the domain locks them out.
- Feature-flag key `sadguruAgent` / `sadguru_agent_enabled` and the
  `com.sadguru.SMOKE_TEST_BUILD` manifest meta-data — internal identifiers
  mirrored in DB rows and CI; the user-facing label already reads "JSR Agent".
- Historic `docs/` and `AUDIT_*.md` files — history, not configuration.
- DB-stored `telegram_url` / `youtube_url` in `app_settings` still point at the
  old handle. Confirm the new handles, then update the rows (data, not code).

## Founder name — single source of truth

New `src/config/faculty.ts` (`INSTITUTE_NAME`, `FOUNDER_NAME`,
`FOUNDER_HONORIFIC`, `FOUNDER_INITIALS`, `AI_ASSISTANT_NAME`, `ASK_TEACHERS`)
and its Deno twin `supabase/functions/_shared/persona.ts`. Founder is
**Pankaj Sir** / **Pankaj Sir Ji**, initials **PS**.

Consumers updated: `PersonalMentorsPanel`, `useLessonChat`, `examTracks`,
`Landing/{Subjects,WhyChooseUs,Footer,HeroIllustration}`,
`admin/LandingCoursesManager`, and the `resolve-doubt` + `chatbot` system
prompts (now template literals reading the persona constants).

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 76 files, 691 passed, 17 skipped
- `npx vite build` — clean

## Still required to make the fix live

Edge functions must be redeployed (`supabase functions deploy`) — a code push
alone does not update the running functions. `.github/workflows/deploy-functions.yml`
could not be added because the GitHub connection lacks the `workflow` scope.
