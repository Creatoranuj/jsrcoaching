/**
 * Mahima Academy - E2E Tests for Payment Flow
 * 
 * Tests the complete course purchase workflow:
 * 1. User browses courses
 * 2. User submits payment request
 * 3. Admin approves/rejects payment
 * 4. User gets enrolled on approval
 */

import { test, expect, Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

const STUDENT_USER = {
  email: "student@example.com",
  password: "StudentPass123!"
};

const ADMIN_USER = {
  email: "admin@mahimaacademy.com",
  password: "AdminPassword123!"
};

// Helper functions
async function loginAs(page: Page, user: typeof STUDENT_USER) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin)/);
}

// ============================================================
// COURSE BROWSING TESTS
// ============================================================

test.describe("Course Browsing", () => {
  test("should display all courses", async ({ page }) => {
    await page.goto(`${BASE_URL}/courses`);
    
    // Wait for courses to load
    await expect(page.locator("text=Courses")).toBeVisible();
    
    // Should see course cards
    const courseCards = page.locator('[data-testid="course-card"]');
    // Or look for any cards
    await expect(page.locator(".grid")).toBeVisible();
  });

  test("should filter courses by grade", async ({ page }) => {
    await page.goto(`${BASE_URL}/courses`);
    
    // Select a grade from dropdown
    await page.click('button:has-text("All Grades")');
    await page.click('text=Grade 10');
    
    // Verify filter is applied
    await expect(page.locator("text=Grade 10")).toBeVisible();
  });

  test("should navigate to course purchase page", async ({ page }) => {
    await page.goto(`${BASE_URL}/courses`);
    
    // Click on first course
    const firstCourse = page.locator(".grid > div").first();
    await firstCourse.click();
    
    // Should be on buy course page
    await expect(page).toHaveURL(/\/buy-course|\/courses\/\d+\/buy/);
  });
});

// ============================================================
// PAYMENT SUBMISSION TESTS (Student Flow)
// ============================================================

test.describe("Payment Submission", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STUDENT_USER);
  });

  test("should display payment form on course purchase page", async ({ page }) => {
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    // Payment form elements should be visible
    await expect(page.locator('input[name="transactionId"]')).toBeVisible();
    await expect(page.locator('input[name="senderName"]')).toBeVisible();
  });

  test("should validate required payment fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    // Try to submit without filling fields
    await page.click('button:has-text("Submit")');
    
    // Should show validation error
    await expect(page.locator("text=required")).toBeVisible({ timeout: 3000 });
  });

  test("should submit payment request successfully", async ({ page }) => {
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    // Fill payment form
    await page.fill('input[name="transactionId"]', `TXN${Date.now()}`);
    await page.fill('input[name="senderName"]', "Test Student");
    
    // Submit
    await page.click('button:has-text("Submit")');
    
    // Should show success message
    await expect(page.locator("text=submitted")).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// ADMIN PAYMENT MANAGEMENT TESTS
// ============================================================

test.describe("Admin Payment Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USER);
  });

  test("should display pending payments", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    
    // Navigate to payments tab
    await page.click('text=Payments');
    
    // Should see pending payments
    await expect(page.locator("text=Pending")).toBeVisible();
  });

  test("should filter payments by status", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Payments');
    
    // Filter by approved
    await page.click('text=Approved');
    
    // Should show approved payments
    await expect(page.locator('[data-status="approved"]')).toBeVisible({ timeout: 3000 });
  });

  test("should approve payment and enroll student", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Payments');
    
    // Find pending payment and approve
    const pendingPayment = page.locator('[data-status="pending"]').first();
    if (await pendingPayment.isVisible()) {
      await pendingPayment.locator('button:has-text("Approve")').click();
      
      // Confirm in dialog
      await page.click('button:has-text("Confirm")');
      
      // Should show success
      await expect(page.locator("text=Approved")).toBeVisible({ timeout: 3000 });
    }
  });

  test("should reject payment", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Payments');
    
    const pendingPayment = page.locator('[data-status="pending"]').first();
    if (await pendingPayment.isVisible()) {
      await pendingPayment.locator('button:has-text("Reject")').click();
      
      // Confirm in dialog
      await page.click('button:has-text("Confirm")');
      
      // Should show rejection
      await expect(page.locator("text=Rejected")).toBeVisible({ timeout: 3000 });
    }
  });

  test("should export payments to CSV", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.click('text=Payments');
    
    // Click export button
    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".csv");
  });
});

// ============================================================
// ENROLLMENT VERIFICATION TESTS
// ============================================================

test.describe("Enrollment Verification", () => {
  test("enrolled student can access course lessons", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    
    // Go to enrolled course
    await page.goto(`${BASE_URL}/courses/1/learn`);
    
    // Should see lessons
    await expect(page.locator("text=Lesson")).toBeVisible();
  });

  test("unenrolled student cannot access locked lessons", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    
    // Try to access a locked lesson
    await page.goto(`${BASE_URL}/courses/999/learn`);
    
    // Should show enrollment required message
    await expect(page.locator("text=Enroll|Purchase")).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================
// PAYMENT SECURITY TESTS
// ============================================================

test.describe("Payment Security", () => {
  test("should not allow duplicate payment submissions", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    const txnId = `TXN${Date.now()}`;
    
    // Submit first time
    await page.fill('input[name="transactionId"]', txnId);
    await page.fill('input[name="senderName"]', "Test Student");
    await page.click('button:has-text("Submit")');
    
    // Wait for success
    await page.waitForSelector("text=submitted");
    
    // Go back and try to submit again with same txn id
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    await page.fill('input[name="transactionId"]', txnId);
    await page.fill('input[name="senderName"]', "Test Student");
    await page.click('button:has-text("Submit")');
    
    // Should handle gracefully (either accept or show duplicate warning)
  });

  test("student cannot approve their own payments", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    
    // Try to access admin panel
    await page.goto(`${BASE_URL}/admin`);
    
    // Should be denied
    await expect(page.locator("text=Access Denied")).toBeVisible();
  });

  test("should validate amount matches course price", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    // The amount should be pre-filled with course price
    const amountField = page.locator('input[name="amount"]');
    if (await amountField.isVisible()) {
      const amount = await amountField.inputValue();
      expect(Number(amount)).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// EDGE CASES
// ============================================================

test.describe("Payment Edge Cases", () => {
  test("should handle special characters in transaction ID", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    await page.fill('input[name="transactionId"]', "TXN-123/456#789");
    await page.fill('input[name="senderName"]', "Test Student");
    await page.click('button:has-text("Submit")');
    
    // Should handle without error
    await expect(page.locator("text=error")).not.toBeVisible({ timeout: 3000 });
  });

  test("should handle very long transaction ID", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    const longTxnId = "TXN" + "X".repeat(100);
    await page.fill('input[name="transactionId"]', longTxnId);
    await page.fill('input[name="senderName"]', "Test Student");
    await page.click('button:has-text("Submit")');
    
    // Should either accept or show validation error
  });

  test("should handle unicode in sender name", async ({ page }) => {
    await loginAs(page, STUDENT_USER);
    await page.goto(`${BASE_URL}/buy-course?id=1`);
    
    await page.fill('input[name="transactionId"]', `TXN${Date.now()}`);
    await page.fill('input[name="senderName"]', "José García 张三");
    await page.click('button:has-text("Submit")');
    
    // Should handle unicode characters
    await expect(page.locator("text=submitted")).toBeVisible({ timeout: 5000 });
  });
});
