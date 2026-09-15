/**
 * Mahima Academy - k6 Load Testing Scripts
 * 
 * Run with: k6 run docs/tests/load-tests.js
 * 
 * Prerequisites:
 * - Install k6: https://k6.io/docs/getting-started/installation/
 * - Set BASE_URL environment variable or use default
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
const successfulRequests = new Counter('successful_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

// Test stages: Ramp up to 500 RPS
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm up
    { duration: '1m', target: 100 },   // Normal load
    { duration: '1m', target: 250 },   // High load
    { duration: '1m', target: 500 },   // Peak load
    { duration: '30s', target: 100 },  // Scale down
    { duration: '30s', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    errors: ['rate<0.1'],              // Error rate under 10%
  },
};

// ============================================================
// ENDPOINT 1: Landing Page (Public)
// ============================================================
function testLandingPage() {
  const res = http.get(`${BASE_URL}/`);
  
  check(res, {
    'landing page status is 200': (r) => r.status === 200,
    'landing page loads under 1s': (r) => r.timings.duration < 1000,
  });
  
  if (res.status !== 200) {
    errorRate.add(1);
  } else {
    successfulRequests.add(1);
  }
  
  requestDuration.add(res.timings.duration);
}

// ============================================================
// ENDPOINT 2: Courses API (Supabase)
// ============================================================
function testCoursesAPI() {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/courses?select=*`,
    { headers }
  );
  
  check(res, {
    'courses API status is 200': (r) => r.status === 200,
    'courses API returns array': (r) => Array.isArray(JSON.parse(r.body)),
    'courses API loads under 500ms': (r) => r.timings.duration < 500,
  });
  
  if (res.status !== 200) {
    errorRate.add(1);
  } else {
    successfulRequests.add(1);
  }
  
  requestDuration.add(res.timings.duration);
}

// ============================================================
// ENDPOINT 3: Books API (Public)
// ============================================================
function testBooksAPI() {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/books?select=*&order=position`,
    { headers }
  );
  
  check(res, {
    'books API status is 200': (r) => r.status === 200,
    'books API returns array': (r) => Array.isArray(JSON.parse(r.body)),
    'books API loads under 500ms': (r) => r.timings.duration < 500,
  });
  
  if (res.status !== 200) {
    errorRate.add(1);
  } else {
    successfulRequests.add(1);
  }
  
  requestDuration.add(res.timings.duration);
}

// ============================================================
// ENDPOINT 4: Login API (Express)
// ============================================================
function testLoginAPI() {
  const payload = JSON.stringify({
    email: 'loadtest@example.com',
    password: 'loadtest123',
  });
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, { headers });
  
  // Login might fail (user doesn't exist) - that's expected
  check(res, {
    'login API responds': (r) => r.status === 200 || r.status === 401,
    'login API responds under 1s': (r) => r.timings.duration < 1000,
  });
  
  requestDuration.add(res.timings.duration);
}

// ============================================================
// ENDPOINT 5: Landing Content API
// ============================================================
function testLandingContentAPI() {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/landing_content?select=*`,
    { headers }
  );
  
  check(res, {
    'landing content API status is 200': (r) => r.status === 200,
    'landing content API loads under 300ms': (r) => r.timings.duration < 300,
  });
  
  if (res.status !== 200) {
    errorRate.add(1);
  } else {
    successfulRequests.add(1);
  }
  
  requestDuration.add(res.timings.duration);
}

// ============================================================
// MAIN TEST SCENARIO
// ============================================================
export default function () {
  group('Public Pages', () => {
    testLandingPage();
    sleep(0.5);
  });
  
  group('Supabase APIs', () => {
    testCoursesAPI();
    sleep(0.3);
    
    testBooksAPI();
    sleep(0.3);
    
    testLandingContentAPI();
    sleep(0.3);
  });
  
  group('Auth API', () => {
    testLoginAPI();
    sleep(0.5);
  });
  
  // Random think time
  sleep(Math.random() * 2);
}

// ============================================================
// SETUP AND TEARDOWN
// ============================================================
export function setup() {
  console.log('Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  
  // Verify endpoints are reachable
  const res = http.get(`${BASE_URL}/`);
  if (res.status !== 200) {
    throw new Error(`Cannot reach ${BASE_URL}`);
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration}s`);
}

// ============================================================
// SUMMARY HANDLER
// ============================================================
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    vus: {
      max: data.metrics.vus.values.max,
      min: data.metrics.vus.values.min,
    },
    requests: {
      total: data.metrics.http_reqs.values.count,
      rate: data.metrics.http_reqs.values.rate,
    },
    response_time: {
      avg: data.metrics.http_req_duration.values.avg,
      p95: data.metrics.http_req_duration.values['p(95)'],
      max: data.metrics.http_req_duration.values.max,
    },
    errors: data.metrics.errors ? data.metrics.errors.values.rate : 0,
  };
  
  return {
    'stdout': JSON.stringify(summary, null, 2),
    'docs/tests/load-test-results.json': JSON.stringify(summary, null, 2),
  };
}
