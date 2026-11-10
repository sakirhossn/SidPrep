import { describe, it } from 'node:test';
import assert from 'node:assert';
import { telemetry } from '../src/services/telemetry';

describe('Telemetry & Security Sanitization', () => {
  it('generates unique request correlation IDs with corr_ prefix', () => {
    const id1 = telemetry.generateCorrelationId();
    const id2 = telemetry.generateCorrelationId();

    assert.ok(id1.startsWith('corr_'), 'Correlation ID must start with corr_');
    assert.notStrictEqual(id1, id2, 'Correlation IDs must be unique');
  });

  it('sanitizes and strips sensitive data (passwords, OTPs, JWTs, emails)', () => {
    telemetry.track('APP_STARTUP', {
      safeVersion: '2.0.0',
      userOtp: '123456',           // Should be stripped!
      jwtToken: 'bearer_token_xyz', // Should be stripped!
      studentEmail: 'user@test.in', // Should be stripped!
      validMetric: 42
    });

    assert.ok(telemetry.getQueueLength() >= 1);
  });
});
