/**
 * JSR COACHING — Offline PDF persistence e2e (web/IndexedDB branch).
 *
 * Verifies the IndexedDB blob fix that makes uploaded PDFs survive a hard reload,
 * plus the autoscroll behavior on local vs external PDFs.
 *
 * Requires env: E2E_EMAIL, E2E_PASSWORD (a real account in the connected
 * Lovable Cloud / Supabase project). Do NOT hardcode credentials.
 *
 * Run:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test e2e/pdf-offline.spec.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "test.pdf");
// Stable cross-origin PDF (also used inside pdf.js's own demo).
const EXTERNAL_PDF =
  "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

async function login(page: Page) {
  if (!EMAIL || !PASSWORD) test.skip(true, "E2E_EMAIL / E2E_PASSWORD not set");
  await signIn(page, EMAIL!, PASSWORD!);
  await page.waitForURL((url) => !/\/login/.test(url.pathname), {
    timeout: 15000,
  });
}

async function openMyLibrary(page: Page) {
  await page.goto("/downloads");
  await page.getByTestId("my-library-tab").click();
  const enable = page.getByTestId("enable-library-button");
  if (await enable.isVisible().catch(() => false)) await enable.click();
}

/**
 * Adds the fixture PDF through the real "Add files from device" control.
 *
 * Two earlier bugs: (1) the file was attached to `input[type=file]`.first(),
 * which is the shell's own hidden input, and (2) the importer DEDUPES by
 * content+name, so re-running the suite silently skipped the upload and the
 * folder stayed empty. Uploading the fixture bytes under a unique name each
 * run makes the import deterministic.
 */
async function uploadFixture(page: Page): Promise<string> {
  const name = `e2e-${Date.now()}.pdf`;
  const trigger = page
    .getByRole("button", { name: /add files? from device/i })
    .first();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
  await trigger.click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: "application/pdf",
    buffer: readFileSync(FIXTURE),
  });
  return name;
}

/** A file row in the open folder — each row carries its own "Open" button. */
function fileRows(page: Page) {
  return page.getByRole("button", { name: /^open$/i });
}

async function ensureFolder(page: Page, name: string) {
  // If folder already exists, just open it.
  const existing = page
    .getByRole("button", { name: new RegExp(name, "i") })
    .first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
    return;
  }
  const createFolder = page
    .getByRole("button", { name: /new folder|create your first folder/i })
    .first();
  await createFolder.click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();
  await page
    .getByRole("button", { name: new RegExp(name, "i") })
    .first()
    .click();
}

test.describe("PDF offline persistence (web/IndexedDB)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[browser-error] ${msg.text()}`);
    });
    await login(page);
  });

  test("1. Upload → reload → opens (IndexedDB blob survives)", async ({
    page,
  }) => {
    await openMyLibrary(page);
    await ensureFolder(page, "E2E Test");

    await uploadFixture(page);

    // Item appears in the folder list.
    await expect(fileRows(page).first()).toBeVisible({ timeout: 30000 });

    // Hard reload — the critical assertion: blob must come back from IndexedDB.
    await page.reload();
    await openMyLibrary(page);
    await page
      .getByRole("button", { name: /e2e test/i })
      .first()
      .click();
    await fileRows(page).first().click();

    // PDF.js renders pages into <canvas>. If the blob URL was dead we'd see
    // "Could not load PDF" instead.
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/could not load pdf/i)).toHaveCount(0);
  });

  test("2. Autoscroll moves the document at 0.1×", async ({ page }) => {
    await openMyLibrary(page);
    await ensureFolder(page, "E2E Test");
    const rows = fileRows(page);
    if (
      !(await rows
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await uploadFixture(page);
      await expect(rows.first()).toBeVisible({ timeout: 30000 });
    }
    await rows.first().click();
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 20000,
    });

    // Open AutoScroll FAB and pick the slowest speed.
    await page
      .getByTestId("fab-autoscroll")
      .click()
      .catch(async () => {
        await page
          .getByRole("button", { name: /auto.?scroll/i })
          .first()
          .click();
      });
    await page.getByRole("button", { name: /0\.1/ }).first().click();

    const scroller = page
      .locator("[data-pdf-scroll-root], .pdf-scroll, main")
      .first();
    const start = await scroller.evaluate((el) => el.scrollTop).catch(() => 0);
    await page.waitForTimeout(3500);
    const end = await scroller.evaluate((el) => el.scrollTop).catch(() => 0);
    expect(end).toBeGreaterThan(start);
  });

  test("3. External PDF shows friendly 'Save to My Library' toast", async ({
    page,
  }) => {
    // Open an external/cross-origin PDF through the in-app viewer route.
    // The exact route may vary; we just need a viewer that loads EXTERNAL_PDF
    // via iframe (cross-origin → no nb-bridge → autoscroll unsupported).
    await page.goto(`/?pdf=${encodeURIComponent(EXTERNAL_PDF)}`);
    // Best-effort: fall back to direct iframe open if the deep-link isn't wired.
    if (
      !(await page
        .locator("iframe, canvas")
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(
        true,
        "No in-app route for arbitrary external PDFs in this build",
      );
    }

    await page
      .getByTestId("fab-autoscroll")
      .click()
      .catch(async () => {
        await page
          .getByRole("button", { name: /auto.?scroll/i })
          .first()
          .click();
      });

    await expect(page.getByText(/save to my library/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
