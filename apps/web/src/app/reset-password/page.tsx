'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Clock,
  XCircle,
  GraduationCap,
} from 'lucide-react';
import { validatePasswordPolicy } from '@sidprep/contracts';
import { PasswordRequirements } from '@/components/PasswordRequirements';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function StudentResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [validating, setValidating] = useState(true);
  const [linkState, setLinkState] = useState<'VALID' | 'EXPIRED' | 'ALREADY_USED' | 'INVALID'>('VALID');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate reset token with GET (opening GET does NOT consume token)
  useEffect(() => {
    if (!token || !email) {
      setLinkState('INVALID');
      setValidating(false);
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/v1/auth/student/reset-password/validate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => null);

        if (data?.valid) {
          setLinkState('VALID');
        } else if (data?.state === 'EXPIRED') {
          setLinkState('EXPIRED');
        } else if (data?.state === 'ALREADY_USED') {
          setLinkState('ALREADY_USED');
        } else {
          setLinkState('INVALID');
        }
      } catch {
        setLinkState('INVALID');
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [token, email]);

  const policy = validatePasswordPolicy(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = policy.isValid && passwordsMatch && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy.isValid) {
      setError(policy.errors[0] || 'Password does not meet requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          resetToken: token,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to reset password.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login?resetSuccess=1');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Error occurred while resetting password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-primary/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-white tracking-tight">
            SidPrep Student Portal
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Choose a new password for your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          {validating ? (
            <div className="text-center py-8 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-slate-400">Verifying reset link...</p>
            </div>
          ) : success ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-heading font-bold text-white">Password Reset Successful</h2>
              <p className="text-xs text-slate-400">
                Your password has been changed. Existing sessions have been revoked.
              </p>
              <p className="text-[11px] text-primary">Redirecting to login...</p>
            </div>
          ) : linkState === 'EXPIRED' ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-heading font-bold text-white">Reset Link Expired</h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  This password-reset link has expired. Reset links are valid for 15 minutes.
                </p>
              </div>
              <Link
                href="/login?tab=forgot"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-semibold"
              >
                Request a New Link
              </Link>
            </div>
          ) : linkState === 'ALREADY_USED' ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-sm font-heading font-bold text-white">Link Already Used</h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  This reset link has already been used. Please log in with your updated password.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Proceed to Login
              </Link>
            </div>
          ) : linkState === 'INVALID' ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-heading font-bold text-white">Invalid Reset Link</h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  The security token is invalid or corrupted.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="new-password" className="text-xs font-semibold text-slate-300">
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-300">
                    Confirm Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-[11px] text-red-400 mt-1">Passwords do not match.</p>
                )}
              </div>

              <PasswordRequirements password={newPassword} />

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    Set New Password
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Cancel and return to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <StudentResetPasswordContent />
    </Suspense>
  );
}
