export interface StudentUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isSingleName?: boolean;
  phone?: string | null;
  phoneCountryCode?: string;
  isPhoneVerified?: boolean;
  isProfileComplete?: boolean;
  targetExams?: string[];
  selectedExamIds?: string[];
  primaryExamId?: string | null;
  preferredLanguage?: 'en' | 'hi' | 'bn';
  dailyGoalMinutes?: number;
  streakDays?: number;
  isEmailVerified?: boolean;
}

export interface StudentTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

const TOKEN_KEY = 'sidprep_student_token';
const USER_KEY = 'sidprep_student_user';

export function getStudentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getStudentUser(): StudentUser | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setStudentSession(user: StudentUser, token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStudentSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isStudentAuthenticated(): boolean {
  return Boolean(getStudentToken());
}
