import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform, Linking } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import type { PushPermissionStatus, UpdateCheckResponse } from '@sidprep/contracts';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { secureStorage } from '../services/secureStorage';
import {
  configureForegroundNotificationHandler,
  ensureReleaseNotificationChannel,
  extractReleaseNotificationPayload,
  getCurrentNotificationPermissionStatus,
  getInstalledAppMetadata,
  requestOsNotificationPermission,
  syncDeviceRegistration,
  type InstalledAppMetadata,
} from '../services/releaseNotifications';
import {
  evaluateUpdatePresentation,
  shouldRunForegroundCheck,
  type UpdateCheckSource,
  type UpdatePresentationDecision,
} from '../services/updatePolicy';

interface UpdateContextType {
  installedApp: InstalledAppMetadata;
  latestCheck: UpdateCheckResponse | null;
  presentation: UpdatePresentationDecision;
  isChecking: boolean;
  lastCheckedAt: number | null;
  permissionStatus: PushPermissionStatus;
  showPermissionExplanation: boolean;
  isTestActive: boolean;
  isSubmittingTest: boolean;
  setTestSessionActive: (active: boolean) => void;
  setTestSubmitting: (submitting: boolean) => void;
  runUpdateCheck: (
    source: UpdateCheckSource,
    releaseId?: string
  ) => Promise<UpdatePresentationDecision>;
  dismissOptionalUpdate: (releaseId: string) => void;
  openUpdateAction: (downloadUrl?: string) => Promise<void>;
  acceptPermissionExplanation: () => Promise<void>;
  declinePermissionExplanation: () => Promise<void>;
  openPermissionPromptFromSettings: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

configureForegroundNotificationHandler();

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const [installedApp] = useState<InstalledAppMetadata>(() => getInstalledAppMetadata());
  const [latestCheck, setLatestCheck] = useState<UpdateCheckResponse | null>(null);
  const [presentation, setPresentation] = useState<UpdatePresentationDecision>({
    action: 'NONE',
  });
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PushPermissionStatus>('UNDETERMINED');
  const [showPermissionExplanation, setShowPermissionExplanation] = useState(false);
  const [isTestActive, setIsTestActive] = useState(false);
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);

  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const pendingNotifReleaseIdRef = useRef<string | null>(null);
  const handledNotifIdsRef = useRef<Set<string>>(new Set());
  const lastCheckAtRef = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const inRunnerRoute = typeof pathname === 'string' && pathname.includes('/runner');
  const effectiveTestActive = isTestActive || inRunnerRoute;

  const runUpdateCheck = useCallback(
    async (
      source: UpdateCheckSource,
      releaseId?: string
    ): Promise<UpdatePresentationDecision> => {
      setIsChecking(true);
      try {
        const res = await api.checkReleaseUpdates({
          platform: installedApp.platform,
          channel: installedApp.releaseChannel,
          version: installedApp.appVersion,
          buildNumber: installedApp.buildNumber,
          releaseId,
        });

        const nowMs = Date.now();
        lastCheckAtRef.current = nowMs;
        setLastCheckedAt(nowMs);
        setLatestCheck(res);

        const decision = evaluateUpdatePresentation({
          checkResult: res,
          dismissedReleaseIds: dismissedIdsRef.current,
          isTestActive: effectiveTestActive,
          isSubmitting: isSubmittingTest,
          source,
        });

        setPresentation(decision);
        return decision;
      } catch {
        const fallback: UpdatePresentationDecision = {
          action: 'NONE',
          reason: 'CHECK_FAILED',
        };
        if (source === 'manual') {
          setPresentation(fallback);
        }
        return fallback;
      } finally {
        setIsChecking(false);
      }
    },
    [installedApp, effectiveTestActive, isSubmittingTest]
  );

  // Startup initialization: notification permissions, push token sync, and initial release check
  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureReleaseNotificationChannel();
      const status = await getCurrentNotificationPermissionStatus();
      if (!mounted) return;
      setPermissionStatus(status);

      if (status === 'GRANTED') {
        await syncDeviceRegistration({ permissionStatus: 'GRANTED' });
      } else if (status === 'UNDETERMINED') {
        await syncDeviceRegistration({ permissionStatus: 'UNDETERMINED' });
        const explained = await secureStorage.hasExplainedNotifications();
        if (mounted && !explained && Platform.OS !== 'web') {
          setShowPermissionExplanation(true);
        }
      } else {
        await syncDeviceRegistration({ permissionStatus: 'DENIED', overridePushToken: null });
      }

      if (mounted) {
        await runUpdateCheck('startup');
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Re-associate installation with active student session when user logs in
  useEffect(() => {
    if (user?.id) {
      void syncDeviceRegistration({ permissionStatus });
    }
  }, [user?.id]);

  // Listen for push token rotation & refresh backend registration automatically
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: any;
    try {
      const Notifications = require('expo-notifications');
      subscription = Notifications.addPushTokenListener((tokenInfo: any) => {
        const token = tokenInfo?.data ? String(tokenInfo.data) : null;
        if (token) {
          const provider =
            Platform.OS === 'ios'
              ? 'APNS'
              : tokenInfo.type === 'fcm'
              ? 'FCM'
              : 'EXPO';
          void syncDeviceRegistration({
            permissionStatus: 'GRANTED',
            overridePushToken: token,
            tokenProvider: provider,
          });
        }
      });
    } catch {
      // Safe fallback
    }
    return () => {
      subscription?.remove?.();
    };
  }, []);

  // Foreground resume check with throttling
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev && prev.match(/inactive|background/) && nextState === 'active') {
        if (
          shouldRunForegroundCheck({
            lastCheckAtMs: lastCheckAtRef.current,
            nowMs: Date.now(),
            isTestActive: effectiveTestActive,
            isSubmitting: isSubmittingTest,
          })
        ) {
          void runUpdateCheck('foreground');
        }
      }
    });
    return () => sub.remove();
  }, [effectiveTestActive, isSubmittingTest, runUpdateCheck]);

  // Notification tap handling (cold-start closed app AND foreground/background warm tap)
  const handleNotificationResponse = useCallback(
    async (response: any) => {
      if (!response) return;
      const notifId = response?.notification?.request?.identifier;
      if (notifId && handledNotifIdsRef.current.has(notifId)) {
        return;
      }

      const payload = extractReleaseNotificationPayload(response);
      if (!payload.isReleaseUpdate) return;
      if (notifId) handledNotifIdsRef.current.add(notifId);

      if (payload.releaseId) {
        const deviceId = await secureStorage.getOrCreateDeviceId();
        void api
          .trackReleaseTap({
            releaseId: payload.releaseId,
            deviceId,
            platform: installedApp.platform,
          })
          .catch(() => {});
      }

      if (effectiveTestActive || isSubmittingTest) {
        // Defer safely until the active mock test ends
        pendingNotifReleaseIdRef.current = payload.releaseId || '__LATEST__';
        return;
      }

      router.push(
        payload.releaseId
          ? (`/update?releaseId=${encodeURIComponent(payload.releaseId)}` as any)
          : ('/update' as any)
      );
    },
    [effectiveTestActive, isSubmittingTest, installedApp.platform, router]
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: any;
    try {
      const Notifications = require('expo-notifications');

      // 1. Cold-start tap from closed app state
      Notifications.getLastNotificationResponseAsync()
        .then((resp: any) => {
          if (resp) {
            void handleNotificationResponse(resp);
          }
        })
        .catch(() => {});

      // 2. Warm/background tap listener
      subscription = Notifications.addNotificationResponseReceivedListener((resp: any) => {
        void handleNotificationResponse(resp);
      });
    } catch {
      // Safe fallback
    }

    return () => {
      subscription?.remove?.();
    };
  }, [handleNotificationResponse]);

  // Safe point resumption: when active mock test ends, enforce deferred updates or notification taps
  useEffect(() => {
    if (effectiveTestActive || isSubmittingTest) return;

    if (pendingNotifReleaseIdRef.current) {
      const targetId = pendingNotifReleaseIdRef.current;
      pendingNotifReleaseIdRef.current = null;
      router.push(
        targetId !== '__LATEST__'
          ? (`/update?releaseId=${encodeURIComponent(targetId)}` as any)
          : ('/update' as any)
      );
      return;
    }

    if (latestCheck) {
      const decision = evaluateUpdatePresentation({
        checkResult: latestCheck,
        dismissedReleaseIds: dismissedIdsRef.current,
        isTestActive: false,
        isSubmitting: false,
        source: 'foreground',
      });
      setPresentation(decision);
    }
  }, [effectiveTestActive, isSubmittingTest, latestCheck, router]);

  const dismissOptionalUpdate = useCallback((releaseId: string) => {
    dismissedIdsRef.current.add(releaseId);
    setPresentation({ action: 'NONE', reason: 'DISMISSED_IN_SESSION' });
  }, []);

  const openUpdateAction = useCallback(
    async (downloadUrl?: string) => {
      const targetUrl =
        downloadUrl ||
        latestCheck?.latestRelease?.downloadUrl ||
        'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk';
      try {
        await Linking.openURL(targetUrl);
      } catch {
        try {
          await Linking.openURL('https://sidprep.in/app');
        } catch {}
      }
    },
    [latestCheck]
  );

  const acceptPermissionExplanation = useCallback(async () => {
    setShowPermissionExplanation(false);
    await secureStorage.setExplainedNotifications(true);
    const nextStatus = await requestOsNotificationPermission();
    setPermissionStatus(nextStatus);
    await syncDeviceRegistration({ permissionStatus: nextStatus });
  }, []);

  const declinePermissionExplanation = useCallback(async () => {
    setShowPermissionExplanation(false);
    await secureStorage.setExplainedNotifications(true);
    setPermissionStatus('DENIED');
    await syncDeviceRegistration({ permissionStatus: 'DENIED', overridePushToken: null });
  }, []);

  const openPermissionPromptFromSettings = useCallback(async () => {
    const current = await getCurrentNotificationPermissionStatus();
    if (current === 'DENIED') {
      try {
        await Linking.openSettings();
      } catch {}
      return;
    }
    setShowPermissionExplanation(true);
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        installedApp,
        latestCheck,
        presentation,
        isChecking,
        lastCheckedAt,
        permissionStatus,
        showPermissionExplanation,
        isTestActive: effectiveTestActive,
        isSubmittingTest,
        setTestSessionActive: setIsTestActive,
        setTestSubmitting: setIsSubmittingTest,
        runUpdateCheck,
        dismissOptionalUpdate,
        openUpdateAction,
        acceptPermissionExplanation,
        declinePermissionExplanation,
        openPermissionPromptFromSettings,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useAppUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error('useAppUpdate must be used within UpdateProvider');
  }
  return ctx;
}
