#!/usr/bin/env node

/**
 * SidPrep 2.0 Deployment Smoke Test
 * Tests running containers / deployed server end-to-end:
 * 1. GET /v1/health -> 200 OK & healthy
 * 2. POST /v1/auth/admin/login -> 200 OK & preAuthToken
 * 3. Extracts live 2FA OTP from email logs or database
 * 4. POST /v1/auth/admin/verify-totp -> 200 OK & adminToken
 * 5. GET /v1/admin/quotas -> 200 OK with adminToken
 */

import { execSync } from 'node:child_process';

const BASE_URL = (process.env.API_URL || 'http://localhost:4000/v1').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sidprep.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminSecurePass123!';

console.log(`[Smoke Test] Target Base URL: ${BASE_URL}`);
console.log(`[Smoke Test] Admin Target: ${ADMIN_EMAIL}`);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(maxAttempts = 30) {
  console.log(`[Smoke Test] Waiting for ${BASE_URL}/health...`);
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'healthy') {
          console.log(`[Smoke Test] Healthcheck verified in attempt ${i}`);
          return body;
        }
      }
    } catch {
      // Container still booting
    }
    await sleep(2000);
  }
  throw new Error(`[Smoke Test] Healthcheck timed out after ${maxAttempts * 2} seconds at ${BASE_URL}/health`);
}

function extractOtpFromLogs() {
  try {
    const logs = execSync('docker compose logs --tail=100 api', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const matches = [...logs.matchAll(/SidPrep Admin 2FA Code:\s*(\d{6})/g)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  } catch {}

  try {
    const logs = execSync('docker logs --tail=100 sidprep_api', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const matches = [...logs.matchAll(/SidPrep Admin 2FA Code:\s*(\d{6})/g)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  } catch {}

  // Fallback: Query PostgreSQL directly if running in Docker
  try {
    const psqlQuery = "SELECT otp FROM email_otp_challenges ORDER BY created_at DESC LIMIT 1;";
    const dbOtp = execSync(`docker compose exec -T postgres psql -U sidprep_user -d sidprep_db -t -c "${psqlQuery}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (/^\d{6}$/.test(dbOtp)) {
      return dbOtp;
    }
  } catch {}

  return null;
}

async function runSmokeTest() {
  // 1. Healthcheck
  const health = await waitForHealth();
  if (health.checks?.database !== 'connected') {
    throw new Error(`[Smoke Test] Database check failed: ${JSON.stringify(health.checks)}`);
  }
  console.log('✔ 1. Healthcheck PASSED: Service is operational and database connected');

  // 2. Admin Login (Step 1)
  console.log('[Smoke Test] Submitting admin credentials...');
  const loginRes = await fetch(`${BASE_URL}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    throw new Error(`[Smoke Test] Admin login failed (${loginRes.status}): ${errText}`);
  }

  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.preAuthToken) {
    throw new Error(`[Smoke Test] Admin login did not return preAuthToken: ${JSON.stringify(loginData)}`);
  }
  console.log('✔ 2. Admin Login (Step 1) PASSED: Pre-auth token received');

  // 3. Resolve 2FA OTP Code
  let otp = loginData.devOtpHint;
  if (!otp) {
    // Check logs with short retry
    for (let attempt = 1; attempt <= 10; attempt++) {
      otp = extractOtpFromLogs();
      if (otp) break;
      await sleep(1000);
    }
  }

  if (!otp) {
    throw new Error('[Smoke Test] Failed to capture 2FA OTP code from email logs or database.');
  }
  console.log(`✔ 3. Live 2FA OTP Code captured: ${otp.substring(0, 2)}****`);

  // 4. Admin 2FA Verification (Step 2)
  console.log('[Smoke Test] Submitting 2FA OTP verification...');
  const verifyRes = await fetch(`${BASE_URL}/auth/admin/verify-totp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: loginData.preAuthToken,
      totpCode: otp,
    }),
  });

  if (!verifyRes.ok) {
    const errText = await verifyRes.text();
    throw new Error(`[Smoke Test] Admin 2FA verification failed (${verifyRes.status}): ${errText}`);
  }

  const verifyData = await verifyRes.json();
  if (!verifyData.success || !verifyData.adminToken) {
    throw new Error(`[Smoke Test] Admin 2FA did not issue adminToken: ${JSON.stringify(verifyData)}`);
  }
  console.log('✔ 4. Admin 2FA Verification (Step 2) PASSED: Admin session token issued');

  // 5. Authenticated Protected Route Verification
  console.log('[Smoke Test] Verifying authenticated access to /admin/quotas...');
  const quotaRes = await fetch(`${BASE_URL}/admin/quotas`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${verifyData.adminToken}`,
    },
  });

  if (!quotaRes.ok) {
    const errText = await quotaRes.text();
    throw new Error(`[Smoke Test] Authenticated quotas request failed (${quotaRes.status}): ${errText}`);
  }

  const quotaData = await quotaRes.json();
  if (quotaData.brevoEmail?.dailyQuota !== 300) {
    throw new Error(`[Smoke Test] Unexpected quota payload: ${JSON.stringify(quotaData)}`);
  }
  console.log('✔ 5. Authenticated Protected Access PASSED: Admin dashboard accessible');

  console.log('\n======================================================');
  console.log('🎉 ALL DEPLOYMENT SMOKE TEST CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================\n');
}

runSmokeTest().catch((err) => {
  console.error('\n❌ SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
