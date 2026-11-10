import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile, SupportedLanguage, StudentRegistrationDraft } from '@sidprep/contracts';
import { api, ApiError } from '../api/client';
import { secureStorage } from '../services/secureStorage';
import { sqliteDb } from '../services/sqliteDatabase';
import { telemetry } from '../services/telemetry';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnboarded: boolean;
  isIntroCompleted: boolean;
  isSuspended: boolean;
  requestOtp: (email: string, phone?: string, registrationDraft?: StudentRegistrationDraft) => Promise<{ success: boolean; message: string; resendAvailableInSeconds?: number }>;
  verifyOtp: (email: string, otp: string, registrationDraft?: StudentRegistrationDraft) => Promise<{ isNewUser?: boolean; isProfileComplete?: boolean }>;
  logout: () => Promise<void>;
  updatePreferences: (data: {
    selectedExamIds?: string[];
    primaryExamId?: string;
    preferredLanguage?: SupportedLanguage;
    dailyTargetMinutes?: number;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  markIntroCompleted: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(false);
  const [isIntroCompleted, setIsIntroCompleted] = useState<boolean>(false);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);

  // Restore session from SecureStore on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await sqliteDb.init();
        telemetry.track('APP_STARTUP');

        // Check introduction completion status
        const introDone = await secureStorage.isIntroCompleted();
        if (isMounted) {
          setIsIntroCompleted(introDone);
        }

        const token = await secureStorage.getAccessToken();
        if (token) {
          // Attempt to fetch fresh profile
          try {
            const profile = await api.getMe();
            if (isMounted) {
              const exams = profile.selectedExamIds || (profile as any).targetExams || [];
              const normalized = {
                ...profile,
                selectedExamIds: exams,
                targetExams: (profile as any).targetExams || exams,
              };
              setUser(normalized);
              setIsSuspended(false);
              const completed = Boolean(
                normalized.isProfileComplete ||
                ((normalized as any).firstName && (normalized as any).phone && exams.length > 0)
              );
              setIsOnboarded(completed);
              await secureStorage.saveUserProfile(JSON.stringify(normalized));
            }
          } catch (e: any) {
            // Distinguish auth rejection (401/403) from network/offline errors
            const isAuthError = e instanceof ApiError ? (e.isUnauthorized || e.isForbidden) : (e?.statusCode === 401 || e?.statusCode === 403);
            if (isAuthError) {
              // Session revoked or account suspended: never restore cached profile as valid
              if (e?.code === 'ACCOUNT_SUSPENDED' && isMounted) {
                setIsSuspended(true);
              }
              await secureStorage.clearAuth();
              if (isMounted) {
                setUser(null);
                setIsOnboarded(false);
              }
            } else {
              // Pure offline fallback: restore cached profile if available
              const cachedUser = await secureStorage.getUserProfile();
              if (cachedUser && isMounted) {
                try {
                  const parsed = JSON.parse(cachedUser);
                  const exams = parsed.selectedExamIds || parsed.targetExams || [];
                  const normalized = {
                    ...parsed,
                    selectedExamIds: exams,
                    targetExams: parsed.targetExams || exams,
                  };
                  setUser(normalized);
                  setIsOnboarded(Boolean(normalized.isProfileComplete || exams.length > 0));
                } catch {
                  // Corrupt cache
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Session restore error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const markIntroCompleted = useCallback(async () => {
    await secureStorage.setIntroCompleted(true);
    setIsIntroCompleted(true);
  }, []);

  const requestOtp = useCallback(async (email: string, phone?: string, registrationDraft?: StudentRegistrationDraft) => {
    if (registrationDraft) {
      await secureStorage.saveRegistrationDraft(registrationDraft);
    }
    const res = await api.requestOtp({ email, phone, registrationDraft });
    return {
      success: res.success,
      message: res.message,
      resendAvailableInSeconds: (res as any).resendAvailableInSeconds || 30
    };
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string, registrationDraft?: StudentRegistrationDraft) => {
    try {
      const res = await api.verifyOtp({ email, otp, registrationDraft });
      await secureStorage.clearRegistrationDraft();

      // Fetch authoritative full profile
      const profile = await api.getMe();
      const exams = profile.selectedExamIds || (profile as any).targetExams || [];
      const normalized = {
        ...profile,
        selectedExamIds: exams,
        targetExams: (profile as any).targetExams || exams,
      };
      setUser(normalized);
      setIsSuspended(false);
      const completed = Boolean(
        normalized.isProfileComplete ||
        ((normalized as any).firstName && (normalized as any).phone && exams.length > 0)
      );
      setIsOnboarded(completed);
      await secureStorage.saveUserProfile(JSON.stringify(normalized));

      return {
        isNewUser: res.user?.isNewUser,
        isProfileComplete: completed
      };
    } catch (e: any) {
      if (e?.code === 'ACCOUNT_SUSPENDED') {
        setIsSuspended(true);
      }
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    }
    await secureStorage.clearAuth();
    setUser(null);
    setIsOnboarded(false);
    setIsSuspended(false);
  }, []);

  const updatePreferences = useCallback(async (data: {
    selectedExamIds?: string[];
    primaryExamId?: string;
    preferredLanguage?: SupportedLanguage;
    dailyTargetMinutes?: number;
  }) => {
    const updated = await api.updateMe(data);
    const exams = updated.selectedExamIds || (updated as any).targetExams || [];
    const normalized = {
      ...updated,
      selectedExamIds: exams,
      targetExams: (updated as any).targetExams || exams,
    };
    setUser(normalized);
    const completed = Boolean(
      normalized.isProfileComplete ||
      ((normalized as any).firstName && (normalized as any).phone && exams.length > 0)
    );
    setIsOnboarded(completed);
    await secureStorage.saveUserProfile(JSON.stringify(normalized));
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await api.getMe();
      const exams = profile.selectedExamIds || (profile as any).targetExams || [];
      const normalized = {
        ...profile,
        selectedExamIds: exams,
        targetExams: (profile as any).targetExams || exams,
      };
      setUser(normalized);
      const completed = Boolean(
        normalized.isProfileComplete ||
        ((normalized as any).firstName && (normalized as any).phone && exams.length > 0)
      );
      setIsOnboarded(completed);
      await secureStorage.saveUserProfile(JSON.stringify(normalized));
    } catch {
      // Retain existing profile if offline
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        isOnboarded,
        isIntroCompleted,
        isSuspended,
        requestOtp,
        verifyOtp,
        logout,
        updatePreferences,
        refreshProfile,
        markIntroCompleted
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
