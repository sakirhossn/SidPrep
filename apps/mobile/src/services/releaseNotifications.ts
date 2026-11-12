import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  PushPermissionStatus,
  ReleaseChannel,
  ReleasePlatform,
} from '@sidprep/contracts';
import { api } from '../api/client';
import { secureStorage } from './secureStorage';

export interface InstalledAppMetadata {
  platform: ReleasePlatform;
  releaseChannel: ReleaseChannel;
  appVersion: string;
  buildNumber: number;
}

export function getInstalledAppMetadata(): InstalledAppMetadata {
  const os = Platform.OS;
  const platform: ReleasePlatform =
    os === 'ios' ? 'IOS' : os === 'web' ? 'WEB' : 'ANDROID';

  let nativeVersion: string | null = null;
  let nativeBuild: string | null = null;
  try {
    const Application = require('expo-application');
    nativeVersion = Application.nativeApplicationVersion || null;
    nativeBuild = Application.nativeBuildVersion || null;
  } catch {
    // Fallback to expoConfig
  }

  const configVersion = Constants.expoConfig?.version || '2.0.3';
  const configBuild =
    platform === 'IOS'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;

  const appVersion = nativeVersion || configVersion;
  const buildNumber = Number(nativeBuild || configBuild || 203) || 203;
  const extraChannel = String(
    Constants.expoConfig?.extra?.releaseChannel || 'PRODUCTION'
  ).toUpperCase();
  const releaseChannel: ReleaseChannel =
    extraChannel === 'BETA' ? 'BETA' : 'PRODUCTION';

  return {
    platform,
    releaseChannel,
    appVersion,
    buildNumber,
  };
}

function getNotificationsModule(): typeof import('expo-notifications') | null {
  try {
    if (Platform.OS === 'web') return null;
    return require('expo-notifications');
  } catch {
    return null;
  }
}

export function configureForegroundNotificationHandler(): void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureReleaseNotificationChannel(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications || Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('app-releases', {
      name: 'App Updates & Releases',
      description: 'Notifications when new SidPrep features or critical updates are available.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#1E3C2C',
    });
  } catch {
    // Safe fallback if channel creation unsupported
  }
}

export async function getCurrentNotificationPermissionStatus(): Promise<PushPermissionStatus> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return 'DENIED';

  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.status === 'granted') {
      return 'GRANTED';
    }
    if (settings.status === 'denied' && !settings.canAskAgain) {
      return 'DENIED';
    }
    return settings.status === 'denied' ? 'DENIED' : 'UNDETERMINED';
  } catch {
    return 'UNDETERMINED';
  }
}

export async function requestOsNotificationPermission(): Promise<PushPermissionStatus> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return 'DENIED';

  await ensureReleaseNotificationChannel();
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') {
      return 'GRANTED';
    }
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.granted || requested.status === 'granted') {
      return 'GRANTED';
    }
    return 'DENIED';
  } catch {
    return 'DENIED';
  }
}

export async function obtainPushToken(
  permissionStatus: PushPermissionStatus
): Promise<{ token: string | null; provider: 'EXPO' | 'FCM' | 'APNS' }> {
  if (permissionStatus !== 'GRANTED') {
    return { token: null, provider: 'EXPO' };
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return { token: null, provider: 'EXPO' };
  }

  try {
    const Device = require('expo-device');
    if (!Device.isDevice) {
      // Simulators/emulators without Play Services may not mint push tokens
      return { token: null, provider: 'EXPO' };
    }
  } catch {
    // Continue attempt
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as any).easConfig?.projectId;

  if (projectId) {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
      if (expoToken?.data) {
        return { token: expoToken.data, provider: 'EXPO' };
      }
    } catch {
      // Fall through to native device token attempt
    }
  }

  try {
    const devToken = await Notifications.getDevicePushTokenAsync();
    if (devToken?.data) {
      const provider =
        Platform.OS === 'ios' ? 'APNS' : devToken.type === 'fcm' ? 'FCM' : 'EXPO';
      return { token: String(devToken.data), provider };
    }
  } catch {
    // Native push credentials (e.g. Firebase google-services.json) not configured on build
  }

  return { token: null, provider: 'EXPO' };
}

export async function syncDeviceRegistration(options?: {
  permissionStatus?: PushPermissionStatus;
  overridePushToken?: string | null;
  tokenProvider?: 'EXPO' | 'FCM' | 'APNS';
}): Promise<PushPermissionStatus> {
  const perm =
    options?.permissionStatus || (await getCurrentNotificationPermissionStatus());
  const meta = getInstalledAppMetadata();
  const deviceId = await secureStorage.getOrCreateDeviceId();

  let pushToken = options?.overridePushToken ?? null;
  let tokenProvider: 'EXPO' | 'FCM' | 'APNS' = options?.tokenProvider || 'EXPO';

  if (options?.overridePushToken === undefined) {
    const obtained = await obtainPushToken(perm);
    pushToken = obtained.token;
    tokenProvider = obtained.provider;
  }

  try {
    await api.registerPushToken({
      deviceId,
      platform: meta.platform,
      releaseChannel: meta.releaseChannel,
      appVersion: meta.appVersion,
      buildNumber: meta.buildNumber,
      pushToken,
      tokenProvider,
      permissionStatus: perm,
    });
  } catch {
    // Best-effort sync; offline devices remain unblocked
  }

  return perm;
}

export function extractReleaseNotificationPayload(response: any): {
  isReleaseUpdate: boolean;
  releaseId?: string;
} {
  const data = response?.notification?.request?.content?.data;
  if (data && data.type === 'APP_RELEASE_UPDATE') {
    return {
      isReleaseUpdate: true,
      releaseId: data.releaseId ? String(data.releaseId) : undefined,
    };
  }
  return { isReleaseUpdate: false };
}
