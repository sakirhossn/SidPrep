'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Sparkles,
  Phone,
  User,
  BookOpen,
  Check,
  Clock,
} from 'lucide-react';
import { setStudentSession, getStudentUser } from '@/lib/auth';
import { validatePasswordPolicy } from '@sidprep/contracts';
import { PasswordRequirements } from '@/components/PasswordRequirements';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface ExamCatalogItem {
  id: string;
  code: string;
  title: string;
  isActive: boolean;
}

const FALLBACK_EXAMS: ExamCatalogItem[] = [
  { id: 'ssc-cgl', code: 'ssc-cgl', title: 'SSC CGL (Staff Selection Commission)', isActive: true },
  { id: 'rrb-ntpc', code: 'rrb-ntpc', title: 'RRB NTPC (Railway Recruitment Board)', isActive: true },
  { id: 'upsc-prelims', code: 'upsc-prelims', title: 'UPSC Civil Services (Prelims)', isActive: true },
  { id: 'bank-po', code: 'bank-po', title: 'IBPS / SBI Probationary Officer (PO)', isActive: true },
];

function StudentAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'register' ? 'REGISTER' : 'LOGIN';

  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>(initialTab);

  // Common notification messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // --- Login State ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [passwordNotSet, setPasswordNotSet] = useState(false);
  const [setupRequested, setSetupRequested] = useState(false);

  // --- Forgot Password Modal State ---
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // --- Register State ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSingleName, setIsSingleName] = useState(false);
  const [phone, setPhone] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Email verification sub-flow for registration
  const [emailOtpStep, setEmailOtpStep] = useState<'IDLE' | 'OTP_SENT' | 'VERIFIED'>('IDLE');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [verificationGrant, setVerificationGrant] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Exam Catalogue
  const [availableExams, setAvailableExams] = useState<ExamCatalogItem[]>(FALLBACK_EXAMS);
  const [selectedExams, setSelectedExams] = useState<string[]>(['ssc-cgl']);
  const [primaryExamId, setPrimaryExamId] = useState<string>('ssc-cgl');

  // Check URL notices & redirection
  useEffect(() => {
    if (getStudentUser()) {
      router.push('/dashboard');
    }

    if (searchParams.get('resetSuccess')) {
      setSuccessMsg('Your password was successfully reset. Please log in with your new password.');
    }
    if (searchParams.get('setupSuccess')) {
      setSuccessMsg('Your password has been configured. You can now log in.');
    }
  }, [router, searchParams]);

  // Load active exams catalogue
  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/exams`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const activeOnly = data.items.filter((item: ExamCatalogItem) => item.isActive);
            if (activeOnly.length > 0) {
              setAvailableExams(activeOnly);
            }
          }
        }
      } catch {
        // Fallback exams already seeded
      }
    };
    fetchExams();
  }, []);

  // OTP Countdown timer
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Editing registration email clears verified status & grant
  const handleRegisterEmailChange = (newEmail: string) => {
    setRegisterEmail(newEmail);
    if (emailOtpStep !== 'IDLE') {
      setEmailOtpStep('IDLE');
      setVerificationGrant(null);
      setEmailOtp('');
    }
  };

  // Dispatch OTP for email verification
  const handleRequestEmailOtp = async () => {
    if (!registerEmail || !registerEmail.includes('@')) {
      setError('Please enter a valid email address before requesting verification.');
      return;
    }

    setError(null);
    setEmailOtpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerEmail.trim().toLowerCase(),
          mode: 'register',
          purpose: 'student_registration',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to dispatch verification code.');
      }

      setEmailOtpStep('OTP_SENT');
      setOtpCountdown(data?.resendCooldownSeconds || 60);

      if (data?.reused) {
        setSuccessMsg(
          data?.message || `A verification code was already sent. Please use that code; it expires shortly.`
        );
      } else {
        const masked = data?.maskedEmail || registerEmail;
        setSuccessMsg(
          data?.devOtpHint
            ? `Verification code dispatched to ${masked}! (Dev Code: ${data.devOtpHint})`
            : `A 6-digit verification code has been sent to ${masked}.`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Could not dispatch verification code.');
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // Verify OTP and capture server-side verification grant
  const handleVerifyEmailOtp = async () => {
    if (emailOtp.trim().length !== 6) {
      setError('Please enter the complete 6-digit code sent to your email.');
      return;
    }

    setError(null);
    setEmailOtpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerEmail.trim().toLowerCase(),
          otp: emailOtp.trim(),
          purpose: 'student_registration',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Invalid or expired verification code.');
      }

      if (!data?.verificationGrant) {
        throw new Error('Verification grant was not received from the server.');
      }

      setVerificationGrant(data.verificationGrant);
      setEmailOtpStep('VERIFIED');
      setSuccessMsg('Email verified successfully! You may now complete your registration.');
    } catch (err: any) {
      setError(err.message || 'Failed to verify email address.');
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // Toggle Exam Multi-Selection
  const toggleExamSelection = (examId: string) => {
    let updated: string[];
    if (selectedExams.includes(examId)) {
      if (selectedExams.length === 1) return; // Must have at least 1
      updated = selectedExams.filter((id) => id !== examId);
    } else {
      updated = [...selectedExams, examId];
    }
    setSelectedExams(updated);
    if (!updated.includes(primaryExamId)) {
      setPrimaryExamId(updated[0]);
    }
  };

  // Normal Student Password Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setPasswordNotSet(false);
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
          deviceInfo: { platform: 'web' },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.error?.code === 'PASSWORD_NOT_SET') {
          setPasswordNotSet(true);
          throw new Error('You have not set a password for this account yet.');
        }
        throw new Error(data?.error?.message || 'Invalid email or password.');
      }

      if (data?.user && data?.accessToken) {
        setStudentSession(data.user, data.accessToken);
        router.push('/dashboard');
      } else {
        throw new Error('Session establishment failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Request password setup for legacy accounts
  const handleRequestPasswordSetup = async () => {
    setError(null);
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/request-password-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => null);

      setSetupRequested(true);
      setSuccessMsg(
        data?.message || 'If an eligible account exists, an expiring link to set your password has been emailed.'
      );
    } catch {
      setError('Unable to request password setup link.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Student Password Reset Request
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setError(null);
    setForgotLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => null);

      setForgotSubmitted(true);
      setSuccessMsg(
        data?.message || 'If an eligible account exists for this email address, a password-reset link will be sent.'
      );
    } catch {
      setError('Unable to process recovery request.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Final Registration Submission
  const registerPolicy = validatePasswordPolicy(registerPassword);
  const registerPasswordsMatch =
    registerPassword === registerConfirmPassword && registerConfirmPassword.length > 0;
  const canRegister =
    firstName.trim().length > 0 &&
    (isSingleName || lastName.trim().length > 0) &&
    phone.trim().length >= 7 &&
    emailOtpStep === 'VERIFIED' &&
    Boolean(verificationGrant) &&
    selectedExams.length > 0 &&
    registerPolicy.isValid &&
    registerPasswordsMatch &&
    !registerLoading;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (emailOtpStep !== 'VERIFIED' || !verificationGrant) {
      setError('Please verify your email address before submitting registration.');
      return;
    }

    if (!registerPolicy.isValid) {
      setError(registerPolicy.errors[0] || 'Password does not meet required policy.');
      return;
    }

    if (!registerPasswordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setRegisterLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: isSingleName ? '' : lastName.trim(),
          isSingleName,
          email: registerEmail.trim().toLowerCase(),
          phone: phone.trim(),
          phoneCountryCode: '+91',
          targetExamIds: selectedExams,
          primaryExamId,
          password: registerPassword,
          verificationGrant,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Registration failed.');
      }

      if (data?.user && data?.accessToken) {
        setStudentSession(data.user, data.accessToken);
        router.push('/dashboard');
      } else {
        setSuccessMsg('Account created successfully! Please sign in.');
        setActiveTab('LOGIN');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-primary/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-white tracking-tight">
            SidPrep 2.0
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Intelligent Competitive Exam Preparation &amp; Analytics
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800/80 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMsg(null);
                setActiveTab('LOGIN');
              }}
              className={`py-2 text-xs font-heading font-bold rounded-lg transition-all ${
                activeTab === 'LOGIN'
                  ? 'bg-primary text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMsg(null);
                setActiveTab('REGISTER');
              }}
              className={`py-2 text-xs font-heading font-bold rounded-lg transition-all ${
                activeTab === 'REGISTER'
                  ? 'bg-primary text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Feedback alerts */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed flex-1">
                <p>{error}</p>
                {passwordNotSet && !setupRequested && (
                  <button
                    type="button"
                    onClick={handleRequestPasswordSetup}
                    className="mt-2 text-[11px] underline text-primary font-semibold block"
                  >
                    Click here to email yourself a secure password setup link.
                  </button>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {/* ================= LOGIN TAB ================= */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="student@example.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none pl-9"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showLoginPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none pl-9 pr-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setForgotEmail(loginEmail);
                    setForgotSubmitted(false);
                    setShowForgotModal(true);
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('REGISTER')}
                  className="text-slate-400 hover:text-white"
                >
                  Need an account?
                </button>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-4"
              >
                {loginLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================= REGISTER TAB ================= */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              {/* Names */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="reg-first-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    First Name *
                  </label>
                  <input
                    id="reg-first-name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Rahul"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-last-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Last Name {!isSingleName && '*'}
                  </label>
                  <input
                    id="reg-last-name"
                    type="text"
                    disabled={isSingleName}
                    required={!isSingleName}
                    value={isSingleName ? '' : lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={isSingleName ? 'Single name' : 'Sharma'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs disabled:opacity-40 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Single name checkbox */}
              <div className="flex items-center gap-2">
                <input
                  id="single-name-chk"
                  type="checkbox"
                  checked={isSingleName}
                  onChange={(e) => {
                    setIsSingleName(e.target.checked);
                    if (e.target.checked) setLastName('');
                  }}
                  className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary"
                />
                <label htmlFor="single-name-chk" className="text-[11px] text-slate-400 select-none">
                  I have only a single legal name (no last name)
                </label>
              </div>

              {/* Mobile Number */}
              <div>
                <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mobile Number *
                </label>
                <div className="flex gap-2">
                  <span className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono flex items-center">
                    +91
                  </span>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    maxLength={10}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Email Address with Verify Button */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="reg-email" className="text-xs font-semibold text-slate-300">
                    Email Address *
                  </label>
                  {emailOtpStep === 'VERIFIED' && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={registerEmail}
                    onChange={(e) => handleRegisterEmailChange(e.target.value)}
                    placeholder="student@example.com"
                    autoComplete="email"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                  {emailOtpStep !== 'VERIFIED' && (
                    <button
                      type="button"
                      onClick={handleRequestEmailOtp}
                      disabled={emailOtpLoading || !registerEmail || otpCountdown > 0}
                      className="px-3 py-2 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-40 text-white text-xs font-semibold shrink-0 flex items-center gap-1"
                    >
                      {emailOtpLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : otpCountdown > 0 ? (
                        `${otpCountdown}s`
                      ) : (
                        'Verify Email'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* OTP Input (Shown only when OTP dispatched and not yet verified) */}
              {emailOtpStep === 'OTP_SENT' && (
                <div className="p-3 rounded-xl bg-slate-800/80 border border-indigo-500/30 space-y-2">
                  <p className="text-[11px] text-slate-300">
                    Enter the 6-digit verification code sent to your email:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-32 tracking-widest text-center py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyEmailOtp}
                      disabled={emailOtpLoading || emailOtp.length !== 6}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      {emailOtpLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Confirm Code
                    </button>
                  </div>
                </div>
              )}

              {/* Preparation Exam Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Competitive Exams (Select all that apply) *
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {availableExams.map((exam) => {
                    const isSelected = selectedExams.includes(exam.id) || selectedExams.includes(exam.code);
                    return (
                      <button
                        key={exam.id}
                        type="button"
                        onClick={() => toggleExamSelection(exam.id)}
                        className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-primary/10 border-primary/50 text-white'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2 font-medium">{exam.title}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Exam Selection when multiple selected */}
              {selectedExams.length > 1 && (
                <div>
                  <label htmlFor="primary-exam-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Primary Exam Focus *
                  </label>
                  <select
                    id="primary-exam-select"
                    value={primaryExamId}
                    onChange={(e) => setPrimaryExamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  >
                    {availableExams
                      .filter((e) => selectedExams.includes(e.id) || selectedExams.includes(e.code))
                      .map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="reg-password" className="text-xs font-semibold text-slate-300">
                    Create Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showRegisterPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showRegisterPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="reg-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  required
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="Enter 8-14 character password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              {/* Confirm Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="reg-confirm-password" className="text-xs font-semibold text-slate-300">
                    Confirm Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRegisterConfirm(!showRegisterConfirm)}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {showRegisterConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showRegisterConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="reg-confirm-password"
                  type={showRegisterConfirm ? 'text' : 'password'}
                  required
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
                {registerConfirmPassword.length > 0 && !registerPasswordsMatch && (
                  <p className="text-[11px] text-red-400 mt-1">Passwords do not match.</p>
                )}
              </div>

              {/* Live requirements checklist & strength meter */}
              <PasswordRequirements password={registerPassword} />

              <button
                type="submit"
                disabled={!canRegister}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-4"
              >
                {registerLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Complete Registration
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {emailOtpStep !== 'VERIFIED' && (
                <p className="text-[11px] text-amber-400/90 text-center">
                  * Please click &quot;Verify Email&quot; and enter your code to enable registration.
                </p>
              )}
            </form>
          )}

          {/* ================= FORGOT PASSWORD MODAL ================= */}
          {showForgotModal && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-2">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <h3 className="font-heading font-bold text-sm text-white">Reset Account Password</h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter your registered email address to receive an expiring 15-minute reset link.
                  </p>
                </div>

                {!forgotSubmitted ? (
                  <form onSubmit={handleForgotSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="modal-forgot-email" className="block text-xs font-semibold text-slate-300 mb-1">
                        Registered Email Address
                      </label>
                      <input
                        id="modal-forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5"
                    >
                      {forgotLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Sending Link...
                        </>
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs text-center leading-relaxed">
                    If an eligible account exists for this email address, a password-reset link will be sent.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-white text-center"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <StudentAuthContent />
    </Suspense>
  );
}
