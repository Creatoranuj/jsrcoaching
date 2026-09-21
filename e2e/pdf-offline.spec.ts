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
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 15000 });
}

async function openMyLibrary(page: Page) {
  await page.goto("/downloads");
  await page.getByTestId("my-library-tab").click();
  const enable = page.getByTestId("enable-library-button");
  if (await enable.isVisible().catch(() => false)) await enable.click();
}

/**
 * The library renders several hidden `<input type="file">`s (root "+" picker,
 * per-folder picker, replace picker). Address the one that accepts PDFs so
 * the fixture is never handed to a picker that ignores it.
 */
function pdfPicker(page: Page) {
  return page.locator('input[type="file"][accept*="pdf"]').first();
}

/** The uploaded row: title is the file name without extension ("test"). */
function uploadedItem(page: Page) {
  return page.getByText(/^test(\.pdf)?$/i).first();
}

/**
 * True when the breadcrumb already shows `name` — the folder is open.
 * The header also renders a folder-switcher DropdownMenuTrigger whose label
 * is the CURRENT folder name; `getByRole("button", { name }).first()` used
 * to hit that trigger after a reload, opening a Radix menu that sets
 * `pointer-events: none` on <body> and swallowed every later click
 * ("<html> intercepts pointer events" in the CI trace).
 */
async function folderIsOpen(page: Page, name: string): Promise<boolean> {
  return page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp(name, "i") })
    .first()
    .isVisible()
    .catch(() => false);
}

/** A folder card — any matching button that is NOT a menu trigger. */
function folderCard(page: Page, name: string) {
  return page.locator("button:not([aria-haspopup])").filter({ hasText: new RegExp(name, "i") }).first();
}

async function ensureFolder(page: Page, name: string) {
  if (await folderIsOpen(page, name)) return;
  const existing = folderCard(page, name);
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
  } else {
    await page.getByRole("button", { name: /new folder/i }).first().click();
    // Create Folder dialog: a single "Name" field plus colour swatches.
    await page.getByRole("alertdialog").getByRole("textbox").first().fill(name);
    await page.getByRole("button", { name: /^create$/i }).click();
    await folderCard(page, name).click();
  }
  await expect
    .poll(() => folderIsOpen(page, name), { timeout: 10000, message: `folder "${name}" did not open` })
    .toBe(true);
}

/** Open the uploaded document through its row's explicit "Open" action. */
async function openUploadedItem(page: Page) {
  const row = page.getByTestId("library-item").filter({ has: uploadedItem(page) }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole("button", { name: /^open$/i }).click();
}

test.describe("PDF offline persistence (web/IndexedDB)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`[browser-error] ${msg.text()}`);
    });
    await login(page);
  });

  test("1. Upload → reload → opens (IndexedDB blob survives)", async ({ page }) => {
    await openMyLibrary(page);
    await ensureFolder(page, "E2E Test");

    // Add PDF via hidden file input. The "Add PDF" button triggers it; we
    // attach the file directly to the input element.
    await pdfPicker(page).setInputFiles(FIXTURE);

    // Item appears in the folder list — the service broadcasts
    // personalLibrary:refresh, so the open folder re-reads IndexedDB at once.
    // 1 MB through the serial write queue on a CI runner can take a few s.
    const item = uploadedItem(page);
    await expect(item).toBeVisible({ timeout: 20000 });

    // Hard reload — the critical assertion: blob must come back from IndexedDB.
    await page.reload();
    await openMyLibrary(page);
    await ensureFolder(page, "E2E Test");
    await openUploadedItem(page);

    // PDF.js renders pages into <canvas>. If the blob URL was dead we'd see
    // "Could not load PDF" instead.
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/could not load pdf/i)).toHaveCount(0);
  });

  test("2. Autoscroll moves the document at 0.1×", async ({ page }) => {
    await openMyLibrary(page);
    await ensureFolder(page, "E2E Test");
    const item = uploadedItem(page);
    if (!(await item.isVisible().catch(() => false))) {
      await pdfPicker(page).setInputFiles(FIXTURE);
      await expect(item).toBeVisible({ timeout: 20000 });
    }
    await openUploadedItem(page);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20000 });

    // Open AutoScroll FAB and pick the slowest speed.
    await page.getByTestId("fab-autoscroll").click().catch(async () => {
      await page.getByRole("button", { name: /auto.?scroll/i }).first().click();
    });
    await page.getByRole("button", { name: /0\.1/ }).first().click();

    const scroller = page
      .locator('[data-pdf-scroll-root], .pdf-scroll, main')
      .first();
    const start = await scroller.evaluate((el) => el.scrollTop).catch(() => 0);
    await page.waitForTimeout(3500);
    const end = await scroller.evaluate((el) => el.scrollTop).catch(() => 0);
    expect(end).toBeGreaterThan(start);
  });

  test("3. External PDF shows friendly 'Save to My Library' toast", async ({ page }) => {
    // Open an external/cross-origin PDF through the in-app viewer route.
    // The exact route may vary; we just need a viewer that loads EXTERNAL_PDF
    // via iframe (cross-origin → no nb-bridge → autoscroll unsupported).
    await page.goto(`/?pdf=${encodeURIComponent(EXTERNAL_PDF)}`);
    // Best-effort: fall back to direct iframe open if the deep-link isn't wired.
    if (!(await page.locator("iframe, canvas").first().isVisible().catch(() => false))) {
      test.skip(true, "No in-app route for arbitrary external PDFs in this build");
    }

    await page.getByTestId("fab-autoscroll").click().catch(async () => {
      await page.getByRole("button", { name: /auto.?scroll/i }).first().click();
    });

    await expect(page.getByText(/save to my library/i)).toBeVisible({ timeout: 5000 });
  });
});
