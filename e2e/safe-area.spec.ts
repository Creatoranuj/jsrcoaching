import { test, expect, type Page } from "@playwright/test";

/**
 * Safe-area regression guard.
 *
 * Simulates an iPhone 14-class notch viewport (390x844) and asserts that
 * fixed / sticky top surfaces on the app's key routes respect
 * `env(safe-area-inset-top)` — i.e. they leave at least SOME top padding
 * on notched devices. This test catches the "header hides under the notch"
 * regression that previously required a manual device build to spot.
 *
 * Routes covered:
 *   - `/`           always public
 *   - `/dashboard`  authed — falls through to `/login` when creds are missing,
 *                    which still exercises a pinned top surface.
 *   - `/lesson/1`   authed — same fallthrough behavior.
 *
 * We assert on whichever page renders (post-redirect), because a login
 * screen with a broken top inset is just as bad as a broken dashboard.
 */

async function assertPinnedRespectSafeArea(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle").catch(() => {
    /* offline / redirect races — fine */
  });

  // Give React one more paint.
  await page.waitForTimeout(300);

  const { pinnedCount, offsets } = await page.evaluate(() => {
    const results: Array<{ tag: string; paddingTop: number; top: number }> = [];
    let pinned = 0;
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el as Element);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      pinned += 1;
      const paddingTop = parseFloat(cs.paddingTop || "0");
      const top = parseFloat(cs.top || "0");
      if (paddingTop > 0 || top > 0) {
        results.push({ tag: (el as Element).tagName, paddingTop, top });
      }
    }
    return { pinnedCount: pinned, offsets: results };
  });

  if (pinnedCount > 0) {
    expect(
      offsets.length,
      `[${route}] at least one fixed/sticky element should respect safe-area (paddingTop or top > 0)`
    ).toBeGreaterThan(0);
  }
}

test.describe("safe-area (notch viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("landing (/) respects safe-area", async ({ page }) => {
    await assertPinnedRespectSafeArea(page, "/");
  });

  test("dashboard (/dashboard) respects safe-area", async ({ page }) => {
    await assertPinnedRespectSafeArea(page, "/dashboard");
  });

  test("lesson (/lesson/1) respects safe-area", async ({ page }) => {
    await assertPinnedRespectSafeArea(page, "/lesson/1");
  });
});
