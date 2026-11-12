import { compareSemver, type UpdateCheckResponse } from '@sidprep/contracts';

export const DEFAULT_FOREGROUND_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

export type UpdateCheckSource = 'startup' | 'foreground' | 'manual' | 'notification_tap';

export type UpdatePresentationDecision =
  | { action: 'NONE'; reason?: string }
  | { action: 'DEFER_SAFE_POINT'; reason: 'MOCK_TEST_ACTIVE' | 'TEST_SUBMITTING' }
  | { action: 'SHOW_WITHDRAWN_NOTICE'; message: string }
  | { action: 'SHOW_UP_TO_DATE'; message: string }
  | {
      action: 'SHOW_OPTIONAL_UPDATE' | 'SHOW_MANDATORY_UPDATE';
      release: NonNullable<UpdateCheckResponse['latestRelease']>;
    };

export function shouldRunForegroundCheck(params: {
  lastCheckAtMs: number | null;
  nowMs: number;
  isTestActive: boolean;
  isSubmitting: boolean;
  throttleMs?: number;
}): boolean {
  if (params.isTestActive || params.isSubmitting) {
    return false;
  }
  const throttle = params.throttleMs ?? DEFAULT_FOREGROUND_THROTTLE_MS;
  if (params.lastCheckAtMs !== null && params.nowMs - params.lastCheckAtMs < throttle) {
    return false;
  }
  return true;
}

export function evaluateUpdatePresentation(params: {
  checkResult: UpdateCheckResponse | null;
  dismissedReleaseIds: Set<string>;
  isTestActive: boolean;
  isSubmitting: boolean;
  source: UpdateCheckSource;
}): UpdatePresentationDecision {
  if (params.isSubmitting) {
    return { action: 'DEFER_SAFE_POINT', reason: 'TEST_SUBMITTING' };
  }
  if (params.isTestActive) {
    return { action: 'DEFER_SAFE_POINT', reason: 'MOCK_TEST_ACTIVE' };
  }

  const res = params.checkResult;
  if (!res) {
    return { action: 'NONE', reason: 'NO_RESPONSE' };
  }

  if (params.source === 'notification_tap' && res.requestedReleaseWithdrawn) {
    return {
      action: 'SHOW_WITHDRAWN_NOTICE',
      message:
        'This update release was withdrawn by SidPrep and is no longer available.',
    };
  }

  if (!res.updateAvailable || !res.latestRelease) {
    if (params.source === 'manual' || params.source === 'notification_tap') {
      return {
        action: 'SHOW_UP_TO_DATE',
        message: 'You are already running the latest version of SidPrep.',
      };
    }
    return { action: 'NONE', reason: 'UP_TO_DATE' };
  }

  if (
    !res.isMandatory &&
    params.source !== 'manual' &&
    params.source !== 'notification_tap' &&
    params.dismissedReleaseIds.has(res.latestRelease.id)
  ) {
    return { action: 'NONE', reason: 'DISMISSED_IN_SESSION' };
  }

  return {
    action: res.isMandatory ? 'SHOW_MANDATORY_UPDATE' : 'SHOW_OPTIONAL_UPDATE',
    release: res.latestRelease,
  };
}

export { compareSemver };
