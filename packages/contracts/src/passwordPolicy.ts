/**
 * SidPrep Centralized Password Policy and Strength Estimator
 *
 * Enforced uniformly across Backend API, Web Client, and Mobile App.
 *
 * Current Policy Constraint:
 * - Minimum 8 characters.
 * - Maximum 14 characters.
 *   NOTE: 14 is a product constraint requested for this release.
 *   Recommendation: Increase to at least 64 characters in a future policy decision.
 * - At least one uppercase letter ([A-Z]).
 * - At least one lowercase letter ([a-z]).
 * - At least one number ([0-9]).
 * - At least one symbol ([^A-Za-z0-9]).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 14;

export interface PasswordPolicyCriteria {
  minLength: boolean;
  maxLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export interface PasswordPolicyResult {
  isValid: boolean;
  criteria: PasswordPolicyCriteria;
  errors: string[];
}

export interface PasswordStrengthResult {
  score: number; // 0 to 100
  level: 'Weak' | 'Medium' | 'Strong';
  feedback: string;
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const pwd = password || '';
  const minLength = pwd.length >= PASSWORD_MIN_LENGTH;
  const maxLength = pwd.length <= PASSWORD_MAX_LENGTH;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);

  const criteria: PasswordPolicyCriteria = {
    minLength,
    maxLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
  };

  const errors: string[] = [];
  if (!minLength) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  }
  if (!maxLength) {
    errors.push(`Password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (!hasUppercase) {
    errors.push('Password must include at least one uppercase letter (A-Z).');
  }
  if (!hasLowercase) {
    errors.push('Password must include at least one lowercase letter (a-z).');
  }
  if (!hasNumber) {
    errors.push('Password must include at least one number (0-9).');
  }
  if (!hasSymbol) {
    errors.push('Password must include at least one symbol or special character.');
  }

  return {
    isValid: errors.length === 0,
    criteria,
    errors,
  };
}

export function estimatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, level: 'Weak', feedback: 'Enter a password to evaluate strength.' };
  }

  let score = 0;
  const len = password.length;

  // 1. Length contribution (up to 35 pts)
  score += Math.min(35, len * 3);

  // 2. Character set variety / pool size (up to 35 pts)
  let charsetSize = 0;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNum = /[0-9]/.test(password);
  const hasSym = /[^A-Za-z0-9]/.test(password);

  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasNum) charsetSize += 10;
  if (hasSym) charsetSize += 33;

  if (charsetSize >= 95) score += 35;
  else if (charsetSize >= 62) score += 25;
  else if (charsetSize >= 36) score += 15;
  else score += 5;

  // 3. Unique character entropy (up to 30 pts)
  const uniqueChars = new Set(password).size;
  const uniqueRatio = uniqueChars / len;
  score += Math.round(uniqueRatio * 30);

  // 4. Penalties for common patterns and repetitions
  // Repetitive characters (e.g. "aaa", "111")
  if (/(.)\1{2,}/i.test(password)) {
    score -= 20;
  }

  // Common sequential patterns
  const lower = password.toLowerCase();
  const sequences = ['123', '234', '345', '456', '567', '678', '789', 'abc', 'bcd', 'cde', 'def', 'efg', 'qwe', 'asd', 'zxc'];
  for (const seq of sequences) {
    if (lower.includes(seq)) {
      score -= 10;
      break;
    }
  }

  // Common dictionary words / roots
  const commonWords = ['password', 'admin', 'sidprep', 'welcome', 'login', 'qwerty', 'letmein'];
  for (const word of commonWords) {
    if (lower.includes(word)) {
      score -= 30;
      break;
    }
  }

  // Clamp score to 0..100
  score = Math.max(0, Math.min(100, score));

  let level: 'Weak' | 'Medium' | 'Strong' = 'Weak';
  let feedback = 'Weak: easily guessed or low complexity.';

  if (score >= 70) {
    level = 'Strong';
    feedback = 'Strong: high entropy and good variation.';
  } else if (score >= 40) {
    level = 'Medium';
    feedback = 'Medium: reasonable complexity, but can be improved with more randomness.';
  }

  return { score, level, feedback };
}
