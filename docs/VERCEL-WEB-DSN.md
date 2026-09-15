# Vercel Web Bundle — Sentry DSN

Closes the P2 observability gap: the Lovable preview and Vercel production web
build run outside the APK CI, so `SENTRY_DSN` from GitHub Actions never reaches
them. Any bug in the web bundle would be invisible without this wiring.

## One-time setup

1. Open the Vercel project → **Settings → Environment Variables**.
2. Add for **Production + Preview**:
   | Name | Value | Scope |
   | --- | --- | --- |
   | `VITE_SENTRY_DSN` | *(paste the same DSN used for APK builds)* | Production, Preview |
   | `VITE_SENTRY_ENVIRONMENT` | `production` (Prod), `preview` (Preview) | per env |
   | `VITE_SENTRY_RELEASE` | `$VERCEL_GIT_COMMIT_SHA` | both |
3. Redeploy. `src/lib/sentry.ts` picks these up on init (already wired).

## Release smoke test

After each Vercel deploy, run the smoke script against the same DSN so a
rotated/broken DSN can never silently mask errors:

```bash
SENTRY_DSN=$VITE_SENTRY_DSN \
SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA \
SENTRY_ENVIRONMENT=production \
  bunx tsx scripts/sentry-smoke.ts
```

Add this as a **Vercel Deploy Hook → Post-deploy** action, or a follow-up
GitHub Action triggered by `deployment_status: success`.

## Verify

- Sentry → Issues → filter `environment:production release:<sha>` — the
  `sentry-smoke` info event must appear within 60s of deploy.
- If missing: DSN wrong, project ID wrong, or ingest rate-limited.
