/**
 * Typed environment access. Centralises every `import.meta.env.*` read so a
 * missing key fails loudly in dev and is grep-able in one place.
 *
 * Required keys come from Lovable Cloud (Supabase). Optional keys are gated
 * features (Sentry, etc.) and degrade silently when absent.
 */
type RawEnv = ImportMetaEnv & Record<string, string | boolean | undefined>;

const raw = import.meta.env as RawEnv;

function required(key: string): string {
  const v = raw[key];
  if (typeof v !== "string" || v.length === 0) {
    // In dev, surface immediately; in prod, return empty string so the app
    // can render a friendly error instead of white-screening.
    if (raw.DEV) {
       
      console.error(`[env] missing required key: ${key}`);
    }
    return "";
  }
  return v;
}

function optional(key: string): string | undefined {
  const v = raw[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export const env = {
  DEV: Boolean(raw.DEV),
  PROD: Boolean(raw.PROD),
  MODE: String(raw.MODE ?? "production"),

  SUPABASE_URL:             required("VITE_SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: required("VITE_SUPABASE_PUBLISHABLE_KEY"),

  SENTRY_DSN: optional("VITE_SENTRY_DSN"),
} as const;

export type Env = typeof env;
