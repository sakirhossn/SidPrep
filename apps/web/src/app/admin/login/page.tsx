'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

const DEFAULT_ADMIN_EMAIL = 'sksakirhossain8@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'AdminSecurePass123!';
const DEFAULT_DEV_TOTP = '123456';

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'PASSWORD' | 'TOTP'>('PASSWORD');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fillDefaultCredentials = () => {
    setEmail(DEFAULT_ADMIN_EMAIL);
    setPassword(DEFAULT_ADMIN_PASSWORD);
    setError(null);
  };

  const fillDefaultTotp = () => {
    setTotpCode(DEFAULT_DEV_TOTP);
    setError(null);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
        setError(err.message || 'Login failed. Please verify staff credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preAuthToken, totpCode: totpCode.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Invalid two-factor authentication TOTP code.');
      }

      sessionStorage.setItem('sidprep_admin_token', data.adminToken);
      sessionStorage.setItem('sidprep_admin_user', JSON.stringify(data.admin));
      router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please enter the valid 6-digit TOTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-primary/20">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-white tracking-tight">
            SidPrep 2.0 Security Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Protected Staff CMS • Role-Based Access & Mandatory 2FA
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              {step === 'PASSWORD' && (
                <div className="pt-2 border-t border-red-500/20 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Want default credentials?</span>
                  <button
                    type="button"
                    onClick={fillDefaultCredentials}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Auto-fill default credentials
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'PASSWORD' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Staff Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
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
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none pr-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Authenticating...' : 'Continue to 2FA Challenge'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="text-center py-2">
                <KeyRound className="w-8 h-8 text-primary mx-auto mb-2" />
                <h3 className="font-heading font-bold text-sm text-white">
                  Enter 6-Digit Authenticator Code
                </h3>
                <p className="text-[11px] text-slate-400">
                  Open Google Authenticator or Authy to retrieve your current TOTP token.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Default Seed Code: <strong className="text-white">123456</strong>
                </span>
                <button
                  type="button"
                  onClick={fillDefaultTotp}
                  className="text-primary hover:underline font-semibold"
                >
                  Auto-fill Code
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Verifying...' : 'Verify TOTP & Access Console'}
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('PASSWORD');
                  setError(null);
                }}
                className="w-full py-2 text-slate-400 hover:text-white text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Password
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-6 text-[11px] text-slate-500">
          All administrative sessions are logged into the immutable audit ledger.
        </div>
      </div>
    </div>
  );
}
