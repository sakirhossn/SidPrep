'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, KeyRound, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { setStudentSession, getStudentUser } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function StudentLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (getStudentUser()) {
      router.push('/dashboard');
    }
  }, [router]);

  // Resend countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Focus OTP input on step switch
  useEffect(() => {
    if (step === 'OTP' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to dispatch verification code.');
      }

      setStep('OTP');
      setCountdown(60);
      setSuccessMsg(
        data?.devOtpHint
          ? `Code sent to ${email}! (Dev Code: ${data.devOtpHint})`
          : `A 6-digit verification code has been dispatched to ${email}.`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the authentication service.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Invalid or expired verification code.');
      }

      const token = data.accessToken || data.tokens?.accessToken;
      const user = data.user || { email: email.trim().toLowerCase(), targetExams: ['SSC_CGL'] };

      setStudentSession(user, token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F2] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E3C2C] flex items-center justify-center text-white font-heading font-extrabold text-xl shadow-md">
              S
            </div>
            <span className="font-heading font-extrabold text-2xl text-slate-900 tracking-tight">
              SidPrep<span className="text-[#28563F] font-bold text-sm ml-1 px-1.5 py-0.5 bg-[#DFF19B]/30 rounded">2.0</span>
            </span>
          </Link>
          <h2 className="font-heading font-bold text-xl text-slate-800">
            {step === 'EMAIL' ? 'Student Sign In & Registration' : 'Check Your Inbox'}
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            {step === 'EMAIL'
              ? 'Passwordless access for SSC, RRB, WBPSC, and IBPS candidates'
              : `Enter the 6-digit code dispatched to ${email}`}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-7 shadow-lg shadow-slate-200/50">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {step === 'EMAIL' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label htmlFor="student-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="student-email"
                    type="email"
                    required
                    placeholder="student@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-[#28563F] focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#1E3C2C] hover:bg-[#28563F] text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Sending code...' : 'Get 6-Digit Verification Code'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                No password required. New candidate accounts are created automatically upon code verification.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center py-2">
                <KeyRound className="w-8 h-8 text-[#28563F] mx-auto mb-2" />
                <h3 className="font-heading font-bold text-sm text-slate-900">
                  Enter 6-Digit Code
                </h3>
              </div>

              <div>
                <label htmlFor="student-otp" className="sr-only">
                  6-digit verification code
                </label>
                <input
                  id="student-otp"
                  ref={otpInputRef}
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  aria-label="6-digit verification code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 rounded-xl border border-slate-300 text-slate-900 focus:ring-2 focus:ring-[#28563F] focus:border-transparent outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 rounded-xl bg-[#1E3C2C] hover:bg-[#28563F] disabled:opacity-50 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Verifying code...' : 'Verify Code & Sign In'}
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('EMAIL');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Change email
                </button>

                <button
                  type="button"
                  disabled={countdown > 0 || loading}
                  onClick={() => handleSendCode()}
                  className="text-[#28563F] hover:underline font-semibold disabled:text-slate-400 disabled:no-underline"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-500">
          Staff or Examiner?{' '}
          <Link href="/admin/login" className="text-[#28563F] hover:underline font-semibold">
            Admin Security Console
          </Link>
        </div>
      </div>
    </div>
  );
}
