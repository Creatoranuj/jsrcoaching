/**
 * Sentry release smoke test.
 *
 * Fires ONE test event at the configured Sentry DSN and exits non-zero if
 * ingestion fails. Wire this into the release workflow (post-APK build,
 * post-Vercel deploy) so a broken/rotated DSN never silently masks prod errors.
 *
 * Usage (CI):
 *   SENTRY_DSN=$SENTRY_DSN SENTRY_RELEASE=$GITHUB_SHA \
 *     bunx tsx scripts/sentry-smoke.ts
 *
 * Exit codes:
 *   0 = event accepted (HTTP 200)
 *   1 = DSN missing/invalid or ingest rejected
 */

const dsn = process.env.SENTRY_DSN;
const release = process.env.SENTRY_RELEASE ?? "smoke-local";
const environment = process.env.SENTRY_ENVIRONMENT ?? "ci";

if (!dsn) {
  console.error("[sentry-smoke] SENTRY_DSN not set");
  process.exit(1);
}

// Parse DSN: https://<publicKey>@<host>/<projectId>
const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
if (!m) {
  console.error("[sentry-smoke] malformed DSN");
  process.exit(1);
}
const [, publicKey, host, projectId] = m;
const url = `https://${host}/api/${projectId}/store/`;

const payload = {
  event_id: crypto.randomUUID().replace(/-/g, ""),
  timestamp: new Date().toISOString(),
  platform: "javascript",
  level: "info",
  release,
  environment,
  logger: "sentry-smoke",
  message: {
    formatted: `sentry-smoke: release ${release} ingest OK`,
  },
  tags: { smoke: "true" },
};

const auth = [
  "Sentry sentry_version=7",
  `sentry_client=nb-smoke/1.0`,
  `sentry_key=${publicKey}`,
].join(", ");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Sentry-Auth": auth,
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error(
    `[sentry-smoke] ingest failed: ${res.status} ${await res.text()}`,
  );
  process.exit(1);
}

console.log(`[sentry-smoke] ok — release=${release} env=${environment}`);
