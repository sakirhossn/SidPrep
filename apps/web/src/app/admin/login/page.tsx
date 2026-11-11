'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  Server,
  Clock,
  KeyRound,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'PASSWORD' | 'TOTP' | 'FORGOT_PASSWORD'>('PASSWORD');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  // Check backend server connectivity on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/app/version`, { cache: 'no-store' });
        setApiOnline(res.ok);
      } catch {
        setApiOnline(false);
      }
    };
    checkServer();
  }, []);

  // Live cooldown timer for resending OTP
  useEffect(() => {
    if (step !== 'TOTP' || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Invalid administrative credentials.');
      }

      setPreAuthToken(data.preAuthToken);
      const masked = data.maskedEmail || (email.trim().length > 3 ? `${email.trim().slice(0, 3)}***@...` : 'your email');
      setMaskedEmail(masked);
      setCountdown(data.resendCooldownSeconds || 180);

      if (data.emailSent) {
        setSuccessMsg(`A 6-digit verification code has been sent to your registered email address: ${masked}`);
      } else {
        setSuccessMsg(`Live 2FA session initialized. Verification code sent to: ${masked}`);
      }

      setStep('TOTP');
    } catch (err: any) {
      const isNetworkError =
        err.name === 'TypeError' ||
        err.message?.includes('fetch') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError');

      if (isNetworkError) {
        setError('Unable to reach the backend API server. Please verify the API service is online.');
      } else {
        setError(err.message || 'Login failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (countdown > 0) return;
    setError(null);
    setSuccessMsg(null);
    setEmailSending(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuthToken, email: email.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to dispatch email verification code.');
      }

      const masked = data.maskedEmail || maskedEmail;
      setMaskedEmail(masked);
      setSuccessMsg(data.message || `A 6-digit verification code has been sent to your registered email address: ${masked}`);
      setCountdown(data.resendCooldownSeconds || 180);
    } catch (err: any) {
      setError(err.message || 'Could not send verification email. Please try again.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json().catch(() => null);

      // Enumeration-resistant: always display the uniform confirmation
      setForgotSubmitted(true);
      setSuccessMsg(
        data?.message || 'If an eligible account exists for this email address, a password-reset link will be sent.'
      );
    } catch (err: any) {
      setError('Unable to submit request. Please verify connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuthToken, totpCode: totpCode.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Invalid 6-digit verification code. Please check your email.');
      }

      if (!data?.adminToken) {
        throw new Error('Verification completed but no administrative session token was received.');
      }

      const adminUser = data.admin || {
        id: data.id || 'adm_owner',
        name: data.name || 'Administrator',
        role: data.role || 'SUPER_ADMIN',
        email: data.email || email,
      };

      const token = data.adminToken;

      sessionStorage.setItem('sidprep_admin_token', token);
      sessionStorage.setItem('sidprep_admin_user', JSON.stringify(adminUser));
      localStorage.setItem('sidprep_admin_token', token);
      localStorage.setItem('sidprep_admin_user', JSON.stringify(adminUser));

      try {
        document.cookie = `sidprep_admin_token=${token}; path=/; max-age=28800; SameSite=Lax`;
      } catch {}

      window.location.href = '/admin';
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please enter the valid 6-digit code sent to your email.');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-primary/20">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-white tracking-tight">
            SidPrep 2.0 Security Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Protected Staff CMS • Role-Based Access &amp; Live Email 2FA
          </p>

          {/* Connection status indicator */}
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px]">
            <Server className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400">Backend Server:</span>
            {apiOnline === null ? (
              <span className="text-slate-500">Checking...</span>
            ) : apiOnline ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
              </span>
            ) : (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Offline
              </span>
            )}
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {step === 'PASSWORD' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Administrative Email Address
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  placeholder="name@domain.com"
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="admin-password" className="text-xs font-semibold text-slate-300">
                    Master Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" /> Show
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none pr-10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setForgotEmail(email);
                    setForgotSubmitted(false);
                    setStep('FORGOT_PASSWORD');
                  }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Authenticating & Sending Code...' : 'Authenticate & Send 2FA Code'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {step === 'FORGOT_PASSWORD' && (
            <div className="space-y-4">
              <div className="text-center py-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-heading font-bold text-white">Reset Administrative Password</h2>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter your registered administrative email to receive an expiring 15-minute reset link.
                </p>
              </div>

              {!forgotSubmitted ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Registered Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      placeholder="name@domain.com"
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Sending Reset Link...
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        Send Password-Reset Link
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs text-center leading-relaxed">
                  Please check your inbox for instructions to securely reset your password.
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setStep('PASSWORD');
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Admin Login
              </button>
            </div>
          )}

          {step === 'TOTP' && (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="text-center py-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto mb-2.5">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="font-heading font-bold text-sm text-white">
                  Enter 6-Digit Verification Code
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                  A 6-digit verification code has been sent to your registered email address:{' '}
                  <strong className="text-white">{maskedEmail}</strong>.
                </p>
              </div>

              <div>
                <label htmlFor="admin-totp" className="sr-only">
                  6-digit admin verification code
                </label>
                <input
                  id="admin-totp"
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  aria-label="6-digit admin verification code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  autoFocus
                />
              </div>

              {/* Live Resend Timer & Button */}
              <div className="pt-1">
                {countdown > 0 ? (
                  <div className="w-full py-2.5 px-3 rounded-xl bg-slate-800/40 border border-slate-800 text-slate-400 text-xs flex items-center justify-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span>Resend code in {formatCountdown(countdown)}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendEmailOtp}
                    disabled={emailSending}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    {emailSending ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        Dispatching Code...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-primary" />
                        Resend Verification Code
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Verifying 2FA Code...' : 'Verify & Enter Security Console'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setTotpCode('');
                  setStep('PASSWORD');
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
