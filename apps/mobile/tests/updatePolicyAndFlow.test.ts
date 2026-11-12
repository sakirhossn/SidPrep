import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UpdateCheckResponse } from '@sidprep/contracts';
import {
  DEFAULT_FOREGROUND_THROTTLE_MS,
  evaluateUpdatePresentation,
  shouldRunForegroundCheck,
} from '../src/services/updatePolicy';

describe('Mobile App Update Policy, Throttling & Active Test Safety', () => {
  const sampleOptionalUpdate: UpdateCheckResponse = {
    updateAvailable: true,
    isMandatory: false,
    belowMinSupported: false,
    latestRelease: {
      id: 'rel_opt_204',
      version: '2.0.4',
      buildNumber: 204,
      platform: 'ANDROID',
      releaseChannel: 'PRODUCTION',
      downloadUrl: 'https://github.com/sakirhossn/SidPrep/releases/download/v2.0.4/SidPrep-Student-v2.0.4.apk',
      releaseNotes: 'Minor UI polish.',
      minSupportedVersion: '2.0.0',
      isMandatory: false,
      otaCompatible: false,
      requiresNativeBinary: true,
    },
  };

  const sampleMandatoryUpdate: UpdateCheckResponse = {
    updateAvailable: true,
    isMandatory: true,
    belowMinSupported: true,
    latestRelease: {
      id: 'rel_mand_205',
      version: '2.0.5',
      buildNumber: 205,
      platform: 'ANDROID',
      releaseChannel: 'PRODUCTION',
      downloadUrl: 'https://github.com/sakirhossn/SidPrep/releases/download/v2.0.5/SidPrep-Student-v2.0.5.apk',
      releaseNotes: 'Critical sync schema fix.',
      minSupportedVersion: '2.0.5',
      isMandatory: true,
      otaCompatible: false,
      requiresNativeBinary: true,
    },
  };

  it('throttles foreground checks within 15 minutes and skips while in an active mock test', () => {
    const t0 = 1_700_000_000_000;

    // Never checked -> allowed
    assert.equal(
      shouldRunForegroundCheck({
        lastCheckAtMs: null,
        nowMs: t0,
        isTestActive: false,
        isSubmitting: false,
      }),
      true
    );

    // Checked 5 minutes ago -> throttled
    assert.equal(
      shouldRunForegroundCheck({
        lastCheckAtMs: t0,
        nowMs: t0 + 5 * 60 * 1000,
        isTestActive: false,
        isSubmitting: false,
      }),
      false
    );

    // Checked 16 minutes ago, idle -> allowed
    assert.equal(
      shouldRunForegroundCheck({
        lastCheckAtMs: t0,
        nowMs: t0 + DEFAULT_FOREGROUND_THROTTLE_MS + 60_000,
        isTestActive: false,
        isSubmitting: false,
      }),
      true
    );

    // Checked 20 minutes ago, but active mock test is running -> blocked
    assert.equal(
      shouldRunForegroundCheck({
        lastCheckAtMs: t0,
        nowMs: t0 + 20 * 60 * 1000,
        isTestActive: true,
        isSubmitting: false,
      }),
      false
    );
  });

  it('never interrupts an active mock test or test submission for a mandatory update', () => {
    const decisionDuringTest = evaluateUpdatePresentation({
      checkResult: sampleMandatoryUpdate,
      dismissedReleaseIds: new Set(),
      isTestActive: true,
      isSubmitting: false,
      source: 'foreground',
    });
    assert.equal(decisionDuringTest.action, 'DEFER_SAFE_POINT');
    if (decisionDuringTest.action === 'DEFER_SAFE_POINT') {
      assert.equal(decisionDuringTest.reason, 'MOCK_TEST_ACTIVE');
    }

    const decisionDuringSubmit = evaluateUpdatePresentation({
      checkResult: sampleMandatoryUpdate,
      dismissedReleaseIds: new Set(),
      isTestActive: false,
      isSubmitting: true,
      source: 'startup',
    });
    assert.equal(decisionDuringSubmit.action, 'DEFER_SAFE_POINT');
    if (decisionDuringSubmit.action === 'DEFER_SAFE_POINT') {
      assert.equal(decisionDuringSubmit.reason, 'TEST_SUBMITTING');
    }

    // Safe point reached after test ends -> enforces mandatory update
    const decisionSafePoint = evaluateUpdatePresentation({
      checkResult: sampleMandatoryUpdate,
      dismissedReleaseIds: new Set(),
      isTestActive: false,
      isSubmitting: false,
      source: 'foreground',
    });
    assert.equal(decisionSafePoint.action, 'SHOW_MANDATORY_UPDATE');
  });

  it('suppresses optional updates dismissed with Later during the session except on manual check', () => {
    const dismissed = new Set<string>(['rel_opt_204']);

    const autoCheck = evaluateUpdatePresentation({
      checkResult: sampleOptionalUpdate,
      dismissedReleaseIds: dismissed,
      isTestActive: false,
      isSubmitting: false,
      source: 'foreground',
    });
    assert.equal(autoCheck.action, 'NONE');

    const manualCheck = evaluateUpdatePresentation({
      checkResult: sampleOptionalUpdate,
      dismissedReleaseIds: dismissed,
      isTestActive: false,
      isSubmitting: false,
      source: 'manual',
    });
    assert.equal(manualCheck.action, 'SHOW_OPTIONAL_UPDATE');
  });

  it('flags withdrawn release safely when opened from a notification tap', () => {
    const withdrawnRes: UpdateCheckResponse = {
      updateAvailable: false,
      isMandatory: false,
      requestedReleaseWithdrawn: true,
      message: 'Withdrawn',
    };

    const tapDecision = evaluateUpdatePresentation({
      checkResult: withdrawnRes,
      dismissedReleaseIds: new Set(),
      isTestActive: false,
      isSubmitting: false,
      source: 'notification_tap',
    });
    assert.equal(tapDecision.action, 'SHOW_WITHDRAWN_NOTICE');
  });
});
