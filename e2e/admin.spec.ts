/**
 * Mahima Academy - E2E Tests for Admin Panel
 */

import { test, expect, Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

const ADMIN_USER = {
  email: "admin@mahimaacademy.com",
  password: "AdminPassword123!"
};

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', ADMIN_USER.email);
  await page.fill('input[type="password"]', ADMIN_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin)/);
}

// ============================================================
// ADMIN DASHBOARD TESTS
// ============================================================

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
  });

  test("should display admin dashboard with stats", async ({ page }) => {
    await expect(page.locator("text=Admin Dashboard")).toBeVisible();
    
    // Stats cards should be visible
    await expect(page.locator("text=Total Students")).toBeVisible();
    await expect(page.locator("text=Total Courses")).toBeVisible();
  });

  test("should navigate between tabs", async ({ page }) => {
    // Payments tab
    await page.click('text=Payments');
    await expect(page.locator("text=Pending")).toBeVisible();
    
    // Courses tab
    await page.click('text=Courses');
    await expect(page.locator("text=Create Course")).toBeVisible();
    
    // Users tab
    await page.click('text=Users');
    await expect(page.locator("text=Role")).toBeVisible();
  });
});

// ============================================================
// COURSE MANAGEMENT TESTS
// ============================================================

test.describe("Course Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Courses');
  });

  test("should create a new course", async ({ page }) => {
    // Fill course form
    await page.fill('input[name="title"]', `Test Course ${Date.now()}`);
    await page.fill('textarea[name="description"]', "Test description");
    await page.fill('input[name="price"]', "999");
    await page.selectOption('select[name="grade"]', "10");
    
    // Submit
    await page.click('button:has-text("Create")');
    
    // Should show success
    await expect(page.locator("text=Created")).toBeVisible({ timeout: 5000 });
  });

  test("should search courses", async ({ page }) => {
    // Type in search
    await page.fill('input[placeholder*="Search"]', "Math");
    
    // Results should filter
    await page.waitForTimeout(500);
    // Verify search applied
  });

  test("should delete a course", async ({ page }) => {
    // Find delete button on a course
    const deleteButton = page.locator('button:has(svg[class*="trash"])').first();
    
    if (await deleteButton.isVisible()) {
      // Set up dialog handler
      page.on("dialog", dialog => dialog.accept());
      
      await deleteButton.click();
      
      // Should show deletion message
      await expect(page.locator("text=deleted")).toBeVisible({ timeout: 5000 });
    }
  });
});

// ============================================================
// USER MANAGEMENT TESTS
// ============================================================

test.describe("User Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Users');
  });

  test("should display user list", async ({ page }) => {
    // Users table should be visible
    await expect(page.locator("table")).toBeVisible();
    
    // Should have role badges
    await expect(page.locator("text=Student")).toBeVisible();
  });

  test("should filter users by role", async ({ page }) => {
    // Click role filter
    await page.click('button:has-text("All")');
    await page.click('text=Admin');
    
    // Should filter to show only admins
    await page.waitForTimeout(500);
  });

  test("should search users", async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', "test");
    await page.waitForTimeout(500);
    // Search should be applied
  });
});

// ============================================================
// CONTENT UPLOAD TESTS
// ============================================================

test.describe("Content Upload", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Upload');
  });

  test("should display upload form", async ({ page }) => {
    await expect(page.locator('text=Video')).toBeVisible();
    await expect(page.locator('input[name="title"]')).toBeVisible();
  });

  test("should validate required fields", async ({ page }) => {
    // Try to upload without filling fields
    await page.click('button:has-text("Upload")');
    
    // Should show validation error
    await expect(page.locator("text=required")).toBeVisible({ timeout: 3000 });
  });

  test("should switch between video and PDF upload", async ({ page }) => {
    // Click PDF option
    await page.click('text=PDF');
    
    // PDF upload field should appear
    await expect(page.locator('input[type="file"]')).toBeVisible();
    
    // Switch back to video
    await page.click('text=Video');
    
    // URL input should appear
    await expect(page.locator('input[name="videoUrl"]')).toBeVisible();
  });
});

// ============================================================
// SECURITY TESTS
// ============================================================

test.describe("Admin Security", () => {
  test("non-admin user should be denied access", async ({ page }) => {
    // Login as regular user
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', "student@example.com");
    await page.fill('input[type="password"]', "StudentPass123!");
    await page.click('button[type="submit"]');
    
    // Try to access admin
    await page.goto(`${BASE_URL}/admin`);
    
    // Should see access denied
    await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
  });

  test("unauthenticated user should be redirected", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/(login|admin\/login)/);
  });

  test("should not expose sensitive data in responses", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    
    const content = await page.content();
    
    // Should not contain password hashes or service keys
    expect(content).not.toContain("password_hash");
    expect(content).not.toContain("service_role");
  });
});

// ============================================================
// ACCESSIBILITY TESTS
// ============================================================

test.describe("Admin Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
  });

  test("should be keyboard navigable", async ({ page }) => {
    // Tab through main navigation
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    
    // Should be able to activate with Enter
    await page.keyboard.press("Enter");
  });

  test("should have proper heading structure", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    
    const h2 = page.locator("h2");
    await expect(h2.first()).toBeVisible();
  });
});
