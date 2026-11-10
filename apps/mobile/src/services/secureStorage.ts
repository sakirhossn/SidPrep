import { getPlatformOS } from './platform';

const ACCESS_TOKEN_KEY = 'sidprep_access_token';
const REFRESH_TOKEN_KEY = 'sidprep_refresh_token';
const USER_KEY = 'sidprep_user_profile';

// In-memory fallback for web and unit test environments
const memoryStorage = new Map<string, string>();

async function getSecureStore() {
  try {
    return require('expo-secure-store');
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const os = getPlatformOS();
  const SecureStore = await getSecureStore();
  if (os === 'web' || os === 'node' || !SecureStore?.setItemAsync) {
    memoryStorage.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
  });
}

async function getItem(key: string): Promise<string | null> {
  const os = getPlatformOS();
  const SecureStore = await getSecureStore();
  if (os === 'web' || os === 'node' || !SecureStore?.getItemAsync) {
    return memoryStorage.get(key) ?? null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function deleteItem(key: string): Promise<void> {
  const os = getPlatformOS();
  const SecureStore = await getSecureStore();
  if (os === 'web' || os === 'node' || !SecureStore?.deleteItemAsync) {
    memoryStorage.delete(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore error if already deleted
  }
}

export const secureStorage = {
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await setItem(ACCESS_TOKEN_KEY, accessToken);
    await setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  async getAccessToken(): Promise<string | null> {
    return getItem(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return getItem(REFRESH_TOKEN_KEY);
  },

  async saveUserProfile(userJson: string): Promise<void> {
    await setItem(USER_KEY, userJson);
  },

  async getUserProfile(): Promise<string | null> {
    return getItem(USER_KEY);
  },

  async clearAuth(): Promise<void> {
    await deleteItem(ACCESS_TOKEN_KEY);
    await deleteItem(REFRESH_TOKEN_KEY);
    await deleteItem(USER_KEY);
  },

  async setIntroCompleted(completed = true): Promise<void> {
    await setItem('sidprep_intro_completed', completed ? 'true' : 'false');
  },

  async isIntroCompleted(): Promise<boolean> {
    const val = await getItem('sidprep_intro_completed');
    return val === 'true';
  },

  async saveRegistrationDraft(draft: any): Promise<void> {
    await setItem('sidprep_reg_draft', JSON.stringify(draft));
  },

  async getRegistrationDraft(): Promise<any | null> {
    const val = await getItem('sidprep_reg_draft');
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  },

  async clearRegistrationDraft(): Promise<void> {
    await deleteItem('sidprep_reg_draft');
  }
};
