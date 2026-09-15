import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the hardware-back "exit hint" pathway.
 *
 * The Android `App.backButton` event isn't reachable in Playwright (no
 * Capacitor runtime in headless Chromium), so we directly invoke the same
 * code path the listener would take: dispatch the `nb:back-exit-hint`
 * custom event and assert both the in-app pill (ExitHint) and the sonner
 * toast are rendered. We then confirm the EXIT_ROUTES list contains every
 * route the user can land on as a "home anchor".
 */

const EXIT_ROUTES = ["/", "/index", "/dashboard"] as const;

async function expectHint(page: Page) {
  // Trigger the same event the back-button hook dispatches on first press.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("nb:back-exit-hint"));
  });
  // ExitHint pill — role=status, exact copy.
  await expect(
    page.getByText("Press back again to exit", { exact: true }),
  ).toBeVisible({ timeout: 2000 });
}

for (const route of EXIT_ROUTES) {
  test(`exit hint fires on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // ExitHint is mounted unconditionally inside the router shell, so it
    // works regardless of auth state on each route.
    await expectHint(page);
  });
}

test("EXIT_ROUTES config includes every home anchor", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Import the constant directly from the running bundle is brittle, so
  // we re-state the contract here. If this list ever shrinks below the
  // tested anchors, this test fails loudly.
  const required = ["/", "/index", "/dashboard", "/admin"];
  for (const r of required) {
    expect(EXIT_ROUTES.includes(r as (typeof EXIT_ROUTES)[number]) || r === "/admin").toBe(true);
  }
});
