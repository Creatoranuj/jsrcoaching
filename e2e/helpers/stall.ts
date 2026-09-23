/**
 * Recovery for the app's stuck-spinner watchdog.
 *
 * `LoadingSpinner` shows "Taking longer than expected… / Retry" after 15 s of
 * a pending route or query. In CI (single worker, cold production server, a
 * remote Supabase) a first paint occasionally lands in exactly that state and
 * never resolves on its own — run #284 failed three specs with nothing but the
 * watchdog on screen (buy gate, lesson progress, lecture listing).
 *
 * A student in that situation taps Retry, which reloads the route. These
 * helpers do the same thing, so a single slow query can no longer turn into a
 * red suite, while a genuinely broken screen still fails (the watchdog comes
 * back and the caller's own assertion times out).
 */
import { type Page } from "@playwright/test";

const STALL_TEXT = /Taking longer than expected/i;

/** True when the watchdog copy is on screen right now. */
export async function isStalled(page: Page): Promise<boolean> {
  return (await page.getByText(STALL_TEXT).count().catch(() => 0)) > 0;
}

/**
 * Clicks Retry while the watchdog is showing (bounded), returning once the
 * screen has moved on. Safe to call on any screen — a no-op when not stalled.
 */
export async function settleApp(page: Page, attempts = 2): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (!(await isStalled(page))) return;
    const retry = page.getByRole("button", { name: /^retry$/i }).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click().catch(() => {});
    } else {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    // Give the reloaded route a chance to paint before re-checking.
    await page
      .waitForFunction(
        (pattern) => !new RegExp(pattern, "i").test(document.body.innerText),
        STALL_TEXT.source,
        { timeout: 20_000 },
      )
      .catch(() => {});
  }
}

/**
 * Polls `check` and retries the stalled screen between attempts. Returns true
 * as soon as the predicate holds, false when the budget runs out.
 */
export async function pollWithStallRecovery(
  page: Page,
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await settleApp(page, 1);
    await page.waitForTimeout(1_000);
  }
  return check().catch(() => false);
}
