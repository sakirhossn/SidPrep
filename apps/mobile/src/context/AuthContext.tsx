import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile, SupportedLanguage } from '@sidprep/contracts';
import { api } from '../api/client';
import { secureStorage } from '../services/secureStorage';
import { sqliteDb } from '../services/sqliteDatabase';
import { telemetry } from '../services/telemetry';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnboarded: boolean;
  requestOtp: (email: string, phone?: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (email: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updatePreferences: (data: {
    selectedExamIds?: string[];
    primaryExamId?: string;
    preferredLanguage?: SupportedLanguage;
    dailyTargetMinutes?: number;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(false);

  // Restore session from SecureStore on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await sqliteDb.init();
        telemetry.track('APP_STARTUP');

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
              setIsOnboarded(exams.length > 0);
            }
          } catch (e) {
            // If offline, restore cached profile
            const cachedUser = await secureStorage.getUserProfile();
            if (cachedUser && isMounted) {
              const parsed = JSON.parse(cachedUser);
              const exams = parsed.selectedExamIds || parsed.targetExams || [];
              const normalized = {
                ...parsed,
                selectedExamIds: exams,
                targetExams: parsed.targetExams || exams,
              };
              setUser(normalized);
              setIsOnboarded(exams.length > 0);
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

  const requestOtp = useCallback(async (email: string, phone?: string) => {
    const res = await api.requestOtp({ email, phone });
    return { success: res.success, message: res.message };
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    try {
      const res = await api.verifyOtp({ email, otp });
      // Fetch full profile
      const profile = await api.getMe();
      const exams = profile.selectedExamIds || (profile as any).targetExams || [];
      const normalized = {
        ...profile,
        selectedExamIds: exams,
        targetExams: (profile as any).targetExams || exams,
      };
      setUser(normalized);
      setIsOnboarded(exams.length > 0);
      return true;
    } catch (e) {
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setIsOnboarded(false);
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
    setIsOnboarded(exams.length > 0);
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
      setIsOnboarded(exams.length > 0);
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
        requestOtp,
        verifyOtp,
        logout,
        updatePreferences,
        refreshProfile
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
