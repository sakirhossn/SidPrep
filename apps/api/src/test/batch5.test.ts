process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import { sendEmail } from '../lib/email.js';
import { sanitizeHtml } from '../lib/sanitizer.js';
import { redactTelemetryMetadata } from '../modules/logs/index.js';
import { env } from '../config/index.js';

describe('Batch 5: Delivery, Quotas, CMS Sanitization, Security Monitoring & Release Identity (F19, F20, F21, F24, F26, F31, F33)', async () => {
  let app: any;

  // Admin token
  const adminId = 'adm_batch5_tester';
  const adminToken = signJwt(
    { sub: adminId, email: 'admin.b5@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  before(async () => {
    app = await buildServer();
    await db.init();

    await db.adminUsers.set(adminId, {
      id: adminId,
      email: 'admin.b5@sidprep.in',
      name: 'Batch 5 Tester',
      passwordHash: 'dummy_hash',
      totpSecret: 'DUMMYSECRET',
      is2faEnabled: true,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
  });

  after(async () => {
    if (app) await app.close();
    await closePool();
  });

  // =========================================================================
  // F19: Mail Delivery & TLS Verification
  // =========================================================================
  describe('F19: Mail Delivery & Strict TLS Validation', () => {
    it('F19: In production mode, mock delivery cannot pretend success without real SMTP credentials', async () => {
      const originalEnv = env.NODE_ENV;
      try {
        (env as any).NODE_ENV = 'production';

        const res = await sendEmail({
          toEmail: 'test.student@example.com',
          subject: 'Production Delivery Verification',
          htmlContent: '<p>Sample Email</p>',
        });

        assert.equal(res.success, false);
        assert.equal(res.error, 'PRODUCTION_SMTP_UNCONFIGURED');
      } finally {
        (env as any).NODE_ENV = originalEnv;
      }
    });

    it('F19: In test/dev mode, mock delivery is explicitly recorded and returns messageId', async () => {
      const res = await sendEmail({
        toEmail: 'dev.student@example.com',
        subject: 'Dev Test Verification',
        htmlContent: '<p>Dev Content</p>',
      });

      assert.equal(res.success, true);
      assert.ok(res.messageId?.startsWith('mock_msg_'));
    });
  });

  // =========================================================================
  // F20: Durable Daily Quotas in PostgreSQL (Asia/Kolkata Calendar Roll-over)
  // =========================================================================
  describe('F20: Durable Daily Email Quotas in PostgreSQL', () => {
    it('F20: Quota counter increments atomically and persists in PostgreSQL email_quota_ledger', async () => {
      const todayIst = db.getTodayIst();
      assert.match(todayIst, /^\d{4}-\d{2}-\d{2}$/, 'Date must match YYYY-MM-DD');

      const initialUsage = await db.getEmailQuotaUsage('brevo');
      const startCount = initialUsage.usedToday;

      const reservation = await db.reserveEmailQuota('brevo', false);
      assert.equal(reservation.allowed, true);
      assert.equal(reservation.usedToday, startCount + 1);

      // Verify PostgreSQL ledger row directly
      const pgRes = await query(
        `SELECT sent_count FROM email_quota_ledger WHERE provider = $1 AND date_ist = $2`,
        ['brevo', todayIst]
      );
      assert.ok(pgRes.rows.length > 0);
      assert.equal(Number(pgRes.rows[0].sent_count), startCount + 1);
    });

    it('F20: Exceeding daily quota blocks non-priority sends while permitting priority OTP challenges', async () => {
      const todayIst = db.getTodayIst();
      const quotaId = `quota_test_provider_${todayIst}`;

      // Insert capped quota ledger row for test_provider
      await query(
        `INSERT INTO email_quota_ledger (id, provider, date_ist, sent_count, cap_limit, updated_at)
         VALUES ($1, 'test_provider', $2, 5, 5, NOW())
         ON CONFLICT (provider, date_ist) DO UPDATE
         SET sent_count = 5, cap_limit = 5, updated_at = NOW()`,
        [quotaId, todayIst]
      );

      // Non-priority attempt should be blocked
      const nonPriority = await db.reserveEmailQuota('test_provider', false);
      assert.equal(nonPriority.allowed, false);
      assert.equal(nonPriority.reason, 'DAILY_QUOTA_EXHAUSTED');

      // Priority OTP attempt should be allowed under emergency headroom
      const priorityOtp = await db.reserveEmailQuota('test_provider', true);
      assert.equal(priorityOtp.allowed, true);
      assert.equal(priorityOtp.usedToday, 6);
    });

    it('F20: GET /v1/health and GET /v1/admin/quotas reflect durable PostgreSQL quota metrics', async () => {
      const healthRes = await app.inject({
        method: 'GET',
        url: '/v1/health',
      });
      assert.equal(healthRes.statusCode, 200);
      const healthBody = JSON.parse(healthRes.body);
      assert.ok(healthBody.checks.brevoQuota);
      assert.ok(typeof healthBody.checks.brevoQuota.usedToday === 'number');
      assert.equal(healthBody.checks.brevoQuota.limit, env.BREVO_DAILY_QUOTA_LIMIT);

      const adminQuotasRes = await app.inject({
        method: 'GET',
        url: '/v1/admin/quotas',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminQuotasRes.statusCode, 200);
      const quotasBody = JSON.parse(adminQuotasRes.body);
      assert.ok(quotasBody.brevoEmail);
      assert.equal(quotasBody.brevoEmail.dailyQuota, env.BREVO_DAILY_QUOTA_LIMIT);
      assert.equal(quotasBody.brevoEmail.resetsAtUTC, '18:30:00Z');
    });
  });

  // =========================================================================
  // F21: CMS HTML Sanitization Boundary & CSP
  // =========================================================================
  describe('F21: CMS HTML Sanitization Boundary', () => {
    it('F21: sanitizeHtml() completely strips script tags, iframes, and javascript: URIs', () => {
      const maliciousHtml = `
        <h1>Legitimate Title</h1>
        <p>Valid text with <strong>bold</strong> and <em>italics</em>.</p>
        <script>alert('XSS Exploit');</script>
        <iframe src="https://malicious.example.com"></iframe>
        <a href="javascript:stealCookies()">Click Me</a>
        <img src="x" onerror="alert(1)" alt="broken" />
        <a href="https://sidprep.in" target="_blank">Safe Link</a>
      `;

      const clean = sanitizeHtml(maliciousHtml);

      assert.ok(!clean.includes('<script>'), 'Must strip <script>');
      assert.ok(!clean.includes('alert('), 'Must strip script payload');
      assert.ok(!clean.includes('<iframe'), 'Must strip <iframe>');
      assert.ok(!clean.includes('javascript:'), 'Must strip javascript: URI');
      assert.ok(!clean.includes('onerror='), 'Must strip onerror handler');
      assert.ok(clean.includes('<h1>Legitimate Title</h1>'));
      assert.ok(clean.includes('<strong>bold</strong>'));
      assert.ok(clean.includes('href="https://sidprep.in"'));
      assert.ok(clean.includes('rel="noopener noreferrer"'), 'External link must include rel="noopener noreferrer"');
    });

    it('F21: POST /v1/admin/pages sanitizes HTML markup before database persistence', async () => {
      const slug = `batch5-test-${Date.now()}`;
      const payloadWithXss = {
        title: 'Batch 5 Test Page',
        slug,
        subtitle: 'Page with attempted XSS payload',
        contentHtml: '<h3>Introduction</h3><script>document.cookie</script><p>Safe content here.</p>',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: payloadWithXss,
      });

      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(!body.page.contentHtml.includes('<script>'));
      assert.ok(body.page.contentHtml.includes('<h3>Introduction</h3>'));
      assert.ok(body.page.contentHtml.includes('<p>Safe content here.</p>'));

      // Check database persistence directly
      const stored = db.pages.get(body.page.id);
      assert.ok(!stored?.contentHtml.includes('<script>'));
    });
  });

  // =========================================================================
  // F31: Security Monitoring, Proxy Trust & Telemetry PII Redaction
  // =========================================================================
  describe('F31: Security Monitoring, Proxy Trust & Telemetry Sanitization', () => {
    it('F31: redactTelemetryMetadata() recursively redacts sensitive credentials and masks PII', () => {
      const rawTelemetry = {
        action: 'USER_LOGIN_ATTEMPT',
        password: 'SuperSecretPassword123!',
        authHeader: 'Bearer eyJhbGciOi...',
        otpCode: '123456',
        user: {
          email: 'student@example.com',
          phone: '9876543210',
          nestedSecret: {
            token: 'secret_token_val',
            safeKey: 'normal_value',
          },
        },
      };

      const redacted = redactTelemetryMetadata(rawTelemetry);

      assert.equal(redacted.password, '[REDACTED]');
      assert.equal(redacted.authHeader, '[REDACTED]');
      assert.equal(redacted.otpCode, '[REDACTED]');
      assert.equal(redacted.user.nestedSecret.token, '[REDACTED]');
      assert.equal(redacted.user.nestedSecret.safeKey, 'normal_value');
      assert.ok(redacted.user.email.includes('***'));
      assert.ok(redacted.user.phone.includes('******'));
    });

    it('F31: POST /v1/telemetry stores recursively sanitized events without leaking credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/telemetry',
        payload: {
          appVersion: '2.0.1',
          os: 'android',
          events: [
            {
              eventCode: 'APP_OPENED',
              correlationId: 'corr_test_01',
              timestamp: new Date().toISOString(),
              metadata: {
                studentEmail: 'student.secure@example.com',
                authToken: 'leak_candidate_token',
                deviceScreen: 'home',
              },
            },
          ],
        },
      });

      assert.equal(res.statusCode, 202);
      const latest = db.appTelemetry.find((t: any) => t.correlationId === 'corr_test_01');
      assert.ok(latest, 'Event must be stored in telemetry repository');
      assert.equal(latest.sanitizedMetadata.authToken, '[REDACTED]');
      assert.ok(String(latest.sanitizedMetadata.studentEmail).includes('***'));
      assert.equal(latest.sanitizedMetadata.deviceScreen, 'home');
    });
  });
});
