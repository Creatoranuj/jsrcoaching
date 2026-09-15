/**
 * Structured logging wrapper. Prefer this over raw console.* in src/.
 *
 * - logInfo / logWarn: forwarded to console + nativeDebug (breadcrumbs).
 * - logError: forwarded to reportError() which handles Sentry + nativeDebug.
 *
 * Keep this module's own console.* calls (they're the sink and are
 * allowlisted by scripts/check-console-usage.mjs).
 */
import { reportError } from "@/lib/sentry";

type Ctx = Record<string, unknown> | undefined;

export function logInfo(message: string, ctx?: Ctx): void {
   
  if (ctx) console.info(`[info] ${message}`, ctx);
   
  else console.info(`[info] ${message}`);
}

export function logWarn(message: string, ctx?: Ctx): void {
   
  if (ctx) console.warn(`[warn] ${message}`, ctx);
   
  else console.warn(`[warn] ${message}`);
}

export function logError(err: unknown, ctx?: Ctx & { surface?: string }): void {
  try {
    reportError(err, ctx);
  } catch {
     
    console.error("[error]", err, ctx);
  }
}
