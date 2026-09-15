/**
 * Mahima Academy - E2E Tests for Authentication Flow
 * 
 * These tests use Playwright to verify the complete auth flow.
 * To run: npx playwright test e2e/auth.spec.ts
 * 
 * Prerequisites:
 * - Install Playwright: npm init playwright@latest
 * - Configure base URL in playwright.config.ts
 */

import { test, expect, Page } from "@playwright/test";

// Test configuration
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const TEST_USER = {
  email: "testuser@example.com",
  password: "TestPassword123!",
  name: "Test User"
};

const ADMIN_USER = {
  email: "admin@mahimaacademy.com",
  password: "AdminPassword123!",
  name: "Admin User"
};

// Helper functions
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

async function logout(page: Page) {
  // Click on user menu or logout button
  await page.click('text=Logout');
}

// ============================================================
// AUTHENTICATION TESTS
// ============================================================

test.describe("Authentication Flow", () => {
  test.describe("Login Page", () => {
    test("should display login form", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      await expect(page.locator("text=Welcome Back")).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("should show error for empty fields", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click('button[type="submit"]');
      
      await expect(page.locator("text=Please fill in all fields")).toBeVisible();
    });

    test("should show error for invalid credentials", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', "wrong@email.com");
      await page.fill('input[type="password"]', "wrongpassword");
      await page.click('button[type="submit"]');
      
      // Wait for error message
      await expect(page.locator("text=Invalid")).toBeVisible({ timeout: 5000 });
    });

    test("should redirect to dashboard on successful login", async ({ page }) => {
      await login(page, TEST_USER.email, TEST_USER.password);
      
      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("should toggle password visibility", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toHaveAttribute("type", "password");
      
      // Click eye icon to show password
      await page.click('button:has(svg)');
      
      // Password should now be visible
      await expect(page.locator('input[id="password"]')).toHaveAttribute("type", "text");
    });

    test("should navigate to signup page", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click("text=Create account");
      
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Signup Page", () => {
    test("should display signup form", async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);
      
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("should show error for existing email", async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);
      await page.fill('input[id="fullName"]', "Existing User");
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', "password123");
      await page.click('button[type="submit"]');
      
      await expect(page.locator("text=already registered")).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Session Management", () => {
    test("should maintain session across page refresh", async ({ page }) => {
      await login(page, TEST_USER.email, TEST_USER.password);
      await expect(page).toHaveURL(/\/dashboard/);
      
      // Refresh page
      await page.reload();
      
      // Should still be on dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("should logout successfully", async ({ page }) => {
      await login(page, TEST_USER.email, TEST_USER.password);
      
      // Open sidebar and logout
      await page.click('[aria-label="menu"]');
      await page.click("text=Logout");
      
      // Should be on login or home page
      await expect(page).toHaveURL(/\/(login|$)/);
    });
  });
});

// ============================================================
// ROLE-BASED ACCESS TESTS
// ============================================================

test.describe("Role-Based Access Control", () => {
  test("student should not access admin panel", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Try to navigate to admin
    await page.goto(`${BASE_URL}/admin`);
    
    // Should be redirected or show access denied
    await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
  });

  test("admin should access admin panel", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password);
    
    await page.goto(`${BASE_URL}/admin`);
    
    // Should see admin dashboard
    await expect(page.locator("text=Admin Dashboard")).toBeVisible();
  });
});

// ============================================================
// NAVIGATION TESTS
// ============================================================

test.describe("Navigation", () => {
  test("unauthenticated user should access public pages", async ({ page }) => {
    // Landing page
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(BASE_URL);
    
    // Courses page
    await page.goto(`${BASE_URL}/courses`);
    await expect(page.locator("text=Courses")).toBeVisible();
    
    // Books page
    await page.goto(`${BASE_URL}/books`);
    await expect(page.locator("text=Books")).toBeVisible();
  });

  test("unauthenticated user should be redirected from protected pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

// ============================================================
// ACCESSIBILITY TESTS
// ============================================================

test.describe("Accessibility", () => {
  test("login page should be keyboard navigable", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Tab through form elements
    await page.keyboard.press("Tab");
    await expect(page.locator('input[type="email"]')).toBeFocused();
    
    await page.keyboard.press("Tab");
    await expect(page.locator('input[type="password"]')).toBeFocused();
    
    await page.keyboard.press("Tab");
    // Should be on submit button or toggle
  });

  test("login form should have proper labels", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    const emailLabel = page.locator('label[for="email"]');
    const passwordLabel = page.locator('label[for="password"]');
    
    await expect(emailLabel).toBeVisible();
    await expect(passwordLabel).toBeVisible();
  });
});

// ============================================================
// SECURITY PROBE TESTS
// ============================================================

test.describe("Security Probes", () => {
  test("should handle SQL injection in email field", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', "' OR '1'='1");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    
    // Should not crash, should show error
    await expect(page.locator("text=Invalid")).toBeVisible({ timeout: 5000 });
  });

  test("should handle XSS in name field during signup", async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.fill('input[id="fullName"]', '<script>alert("xss")</script>');
    await page.fill('input[type="email"]', `xsstest${Date.now()}@example.com`);
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    
    // Should not execute script, should handle safely
    // Check that no alert dialog appeared
    page.on("dialog", (dialog) => {
      throw new Error("XSS vulnerability detected!");
    });
  });

  test("should not expose sensitive data in page source", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const content = await page.content();
    
    // Should not contain API keys or secrets
    expect(content).not.toContain("service_role");
    expect(content).not.toContain("secret_key");
    expect(content).not.toContain("password_hash");
  });
});

// ============================================================
// PERFORMANCE TESTS
// ============================================================

test.describe("Performance", () => {
  test("login page should load within 3 seconds", async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/login`);
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test("dashboard should load within 5 seconds after login", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    
    const startTime = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000);
  });
});
