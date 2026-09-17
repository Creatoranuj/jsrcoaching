# Observer Report — 2026-09-17 — Edge deploy attempt + live end-to-end test

**Window observed:** this session (post plan approval "Ask a Doubt chalu karna + end-to-end verification")
**Scope:** ALLOWED_ORIGINS secret popup, edge-function deploy path, live production E2E on https://jsrcoaching.vercel.app

## What the user's screenshot was

Supabase Dashboard → Edge Functions → Secrets → "Confirm replacing existing secret":
`ALLOWED_ORIGINS` already exists. Answer: **Replace secret** is correct and safe.

Recommended value (comma separated, live host first):

```
https://jsrcoaching.vercel.app,https://localhost,capacitor://localhost
```

`https://localhost` / `capacitor://localhost` cover the Capacitor Android WebView origin.

## Incomplete

- [ ] **ALLOWED_ORIGINS still holds the retired domain** — verified live 04:12 UTC via OPTIONS
  preflight on `resolve-doubt`, `chatbot`, `ai-health` with `Origin: https://jsrcoaching.vercel.app`:
  all three answered `access-control-allow-origin: https://safarenglishka.vercel.app`.
  Notably the response carried **no `X-Origin-Known` header**, which `_shared/cors.ts:95` adds —
  so production is running a build older than the current `_shared/cors.ts`.
  Next action: replace the secret. Because `isOriginAllowed()` consults `ALLOWED` in every
  historical version of the helper, the secret change alone is expected to fix it without a redeploy.

- [ ] **Cannot deploy edge functions from the Lovable project.** Bringing the repo's 44
  `supabase/functions/**` into this TanStack project is blocked by platform policy
  ("New Supabase Edge Functions are not created in this TanStack project") — both shell copy and
  the file-write tool were refused. `supabase--deploy_edge_functions` is therefore unusable here.
  Redeploy remains a user/CI action (Supabase access token or the never-landed
  `deploy-functions.yml`, blocked earlier by a GitHub token missing `workflow` scope).

- [ ] **9-step audit fix plan: still 0/9 applied** (unchanged from the previous observer report).

## Live E2E results (production, unauthenticated)

Playwright, desktop 1280x1800 and mobile 411x697.

| Route | Result |
|---|---|
| `/` | 200, renders hero + nav, no console errors, no failed requests |
| `/courses`, `/books`, `/notices`, `/all-classes`, `/all-tests`, `/doubts`, `/dashboard` | 200, correctly gated → login screen |
| `/login`, `/signup` | 200, forms render |
| `/privacy` | 200, policy renders |
| `/install` | 200, renders |
| `/login-otp` | 200 — **"Under construction. OTP login is temporarily unavailable."** |
| `/auth`, `/about`, `/contact` | in-app 404 (no such route; only reached because they were probed) |

Home page navigation timing (mobile viewport): DCL 43ms, load 102ms, 72 resources, ~140KB transferred
on first paint — the 935KB export chunk is correctly lazy and not on the critical path.

### CORS failure reproduced in a real browser

From `https://jsrcoaching.vercel.app`, a `fetch()` to `/functions/v1/resolve-doubt` failed with:

```
Access to fetch at '.../functions/v1/resolve-doubt' from origin 'https://jsrcoaching.vercel.app'
has been blocked by CORS policy
net::ERR_FAILED
```

This is exactly the student-facing "Failed to send a request to the Edge Function" path. Hard proof
that the blocker is the deployed origin config, not app code.

## Follow-ups deferred

- [ ] Authenticated flows (course open, lesson video, PDF reader, quiz submit, Ask a Doubt answer)
  were **not** executed — this is an external production Supabase with real student accounts and no
  test credentials were provided. Needs a dedicated test account before an authenticated E2E pass.
- [ ] `/login-otp` under-construction state: confirm whether phone login is intentionally disabled
  in production or is a regression.

## Linked to current work

- `_shared/cors.ts:29-61` already allow-lists `jsrcoaching.vercel.app`, its preview pattern, and the
  Capacitor origins; production not sending `X-Origin-Known` proves the deployed bundle predates it.
  Two independent fixes exist (secret replace, redeploy) — the secret is the one the user can do now.

## Risks

- Production edge functions and repo `supabase/functions/` are **out of sync**, with no CI deploy job.
  Any future edge fix will silently not reach users until this is resolved.

## Notes on visibility

- Tool activity is not in the chat search index; every claim above was re-verified against live HTTP,
  a real browser session, or the repo at `2c10630`.
- No source files, migrations, or security findings were modified in this pass.
