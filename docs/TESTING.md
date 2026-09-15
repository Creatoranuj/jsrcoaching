# Mahima Academy - Test Suite Documentation

## Overview

This document describes the test suite for the Mahima Academy education platform. Unit/integration tests and backend/security checks are the preferred automated gates. Playwright and Maestro flows are optional manual QA references unless stable test credentials and seeded data are configured.

## Test Structure

```
├── docs/
│   ├── QA-AUDIT.md           # Full QA audit report
│   └── tests/
│       ├── rls-tests.sql      # RLS policy verification queries
│       └── load-tests.js      # k6 load testing scripts
├── src/test/
│   ├── setup.ts               # Vitest setup
│   ├── example.test.ts        # Example test
│   ├── auth.test.ts           # Authentication tests
│   ├── components/
│   │   └── Login.test.tsx     # Login component tests
│   └── hooks/
│       ├── useEnrollments.test.ts
│       └── usePayments.test.ts
├── e2e/
│   ├── auth.spec.ts           # Auth flow E2E tests
│   ├── payment-flow.spec.ts   # Payment flow E2E tests
│   └── admin.spec.ts          # Admin panel E2E tests
└── playwright.config.ts       # Playwright configuration
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run specific file
npm run test src/test/auth.test.ts

# Watch mode
npm run test -- --watch
```

### Optional E2E Tests (Playwright — local/manual only)

> Current CI note: the GitHub “Playwright E2E” workflow was removed because it required test credentials and seeded Supabase data. Keeping it out of CI prevents false failures from blocking APK releases.

```bash
# Install Playwright (first time only)
npx playwright install

# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Run with UI
npx playwright test --ui

# Run in headed mode
npx playwright test --headed

# Generate HTML report
npx playwright show-report
```

### RLS Policy Tests

Run in Supabase SQL Editor:
1. Go to https://supabase.com/dashboard/project/wegamscqtvqhxowlskfm/sql/new
2. Paste contents of `docs/tests/rls-tests.sql`
3. Run as different user roles to verify policies

### Load Tests (k6)

```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io

# Run load test
k6 run docs/tests/load-tests.js

# Run with specific VUs
k6 run --vus 100 --duration 30s docs/tests/load-tests.js
```

## Test Categories

### 1. Authentication Tests (`src/test/auth.test.ts`)
- Login flow (success, failure, validation)
- Registration flow
- Session management
- Role-based access
- Security probes (SQL injection, XSS, auth bypass)

### 2. Component Tests (`src/test/components/`)
- Login page rendering
- Form interactions
- Form submission
- Error handling
- Accessibility

### 3. Hook Tests (`src/test/hooks/`)
- useEnrollments: enrollment fetching, checking, creating
- usePayments: payment creation, approval, rejection

### 4. E2E Tests (`e2e/`)
- Full authentication flows
- Course purchase workflow
- Admin dashboard operations
- Role-based access control
- Security verification

### 5. RLS Policy Tests (`docs/tests/rls-tests.sql`)
- Verify each table's RLS policies
- Test as different roles
- Security probe queries

### 6. Load Tests (`docs/tests/load-tests.js`)
- Landing page performance
- API endpoint performance
- Supabase query performance
- Concurrent user simulation

## Coverage Goals

| Area | Current | Target |
|------|---------|--------|
| Auth Flow | 95% | 95% |
| Enrollments | 90% | 95% |
| Payments | 90% | 95% |
| Admin Panel | 80% | 90% |
| RLS Policies | 100% | 100% |

## CI/CD Integration

Recommended default CI gate:

```yaml
test:
  steps:
    - bun install --frozen-lockfile
    - bun run build
```

Only re-add Playwright/Maestro to CI after both conditions are true:
1. Dedicated test account secrets exist in GitHub Actions.
2. Supabase test seed data exists for receipts, PDFs, subscriptions, and dashboard flows.

## Maintenance

- Run tests before each deployment
- Update tests when adding new features
- Review RLS tests when modifying policies
- Run load tests periodically to catch performance regressions
