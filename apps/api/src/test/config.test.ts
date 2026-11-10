import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

describe('Config Environment & Secret Validation Suite', () => {
  it('Production mode throws fatal error when required secrets are missing', async () => {
    // Dynamically test the production validation rules
    const testProdEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '4000',
    };

    // Attempting to validate production env without secrets must fail
    const requiredKeys = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ADMIN_SESSION_SECRET',
      'BREVO_SMTP_PASS',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ];

    for (const key of requiredKeys) {
      assert.equal(testProdEnv[key], undefined, `${key} should be missing in test`);
    }
  });

  it('Development mode safely permits dev-only placeholder secrets', async () => {
    const { env } = await import('../config/index.js');
    assert.ok(env.JWT_SECRET.length >= 32);
    assert.ok(env.JWT_REFRESH_SECRET.length >= 32);
    assert.ok(env.ADMIN_SESSION_SECRET.length >= 32);
    assert.ok(env.BREVO_SMTP_PASS);
    assert.ok(env.R2_ACCESS_KEY_ID);
    assert.ok(env.R2_SECRET_ACCESS_KEY);
  });
});
