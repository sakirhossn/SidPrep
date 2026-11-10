'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Mail,
  Phone,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Check,
} from 'lucide-react';
import { setStudentSession, getStudentUser } from '@/lib/auth';
import { getApiBaseUrl } from '@/lib/api-client';

interface ExamCatalogueItem {
  id: string;
  code: string;
  title: string;
  name?: string;
  body: string;
  isActive?: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSingleName, setIsSingleName] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [primaryExamId, setPrimaryExamId] = useState('');

  // Available Exams from Backend Catalogue
  const [catalogueExams, setCatalogueExams] = useState<ExamCatalogueItem[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // OTP and Verification State
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (getStudentUser()) {
      router.push('/dashboard');
    }
  }, [router]);

  // Fetch active exams from backend catalogue
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const base = getApiBaseUrl();
        const res = await fetch(`${base}/v1/exams`);
        if (!res.ok) throw new Error('Failed to load exams');
        const data = await res.json();
        const list: ExamCatalogueItem[] = Array.isArray(data) ? data : data.data || [];
        if (mounted) {
          setCatalogueExams(list);
          if (list.length > 0) {
            setSelectedExams([list[0]!.id]);
            setPrimaryExamId(list[0]!.id);
          }
        }
      } catch (err) {
        console.warn('Exam catalogue fetch error:', err);
        // Clean baseline fallback
        if (mounted) {
          const fallback = [
            { id: 'ssc-cgl', code: 'SSC_CGL', title: 'SSC Combined Graduate Level (CGL)', body: 'SSC' },
            { id: 'rrb-ntpc', code: 'RRB_NTPC', title: 'RRB Non-Technical Categories (NTPC)', body: 'RRB' },
            { id: 'wbpsc-clerkship', code: 'WBPSC_CLERKSHIP', title: 'WBPSC Clerkship Examination', body: 'WBPSC' },
            { id: 'ibps-po', code: 'IBPS_PO', title: 'IBPS Probationary Officer (PO)', body: 'IBPS' },
          ];
          setCatalogueExams(fallback);
          setSelectedExams(['ssc-cgl']);
          setPrimaryExamId('ssc-cgl');
        }
      } finally {
        if (mounted) setLoadingExams(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  const toggleExamSelection = (examId: string) => {
    if (selectedExams.includes(examId)) {
      if (selectedExams.length > 1) {
        const next = selectedExams.filter((id) => id !== examId);
        setSelectedExams(next);
        if (primaryExamId === examId) {
          setPrimaryExamId(next[0]!);
        }
      }
    } else {
      const next = [...selectedExams, examId];
      setSelectedExams(next);
      if (!primaryExamId) {
        setPrimaryExamId(examId);
      }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const cleanFirst = firstName.trim();
    const cleanLast = isSingleName ? '' : lastName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (!cleanFirst) {
      setError('Please enter your first name.');
      return;
    }

    if (!isSingleName && !cleanLast) {
      setError('Please enter your last name or select "I have only a single name".');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.length > 15) {
      setError('Please enter a valid mobile number (7–15 digits).');
      return;
    }

    if (selectedExams.length === 0) {
      setError('Please select at least one preparation exam.');
      return;
    }

    setLoading(true);

    const draft = {
      firstName: cleanFirst,
      lastName: cleanLast,
      isSingleName,
      email: cleanEmail,
      phoneCountryCode,
      phone: cleanPhone,
      targetExamIds: selectedExams,
      primaryExamId: primaryExamId || selectedExams[0]!,
      preferredLanguage: 'en' as const,
    };

    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/v1/auth/student/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          mode: 'register',
          registrationDraft: draft,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409 || data?.error?.code === 'ACCOUNT_EXISTS') {
          throw new Error('An account with this email address already exists. Please log in instead.');
        }
        throw new Error(data?.error?.message || 'Failed to dispatch verification code.');
      }

      setStep('OTP');
      setCountdown(30);
      setSuccessMsg(
        data?.devOtpHint
          ? `Verification code dispatched! (Dev Code: ${data.devOtpHint})`
          : `A 6-digit verification code has been dispatched to ${cleanEmail}.`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the registration service.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    const cleanFirst = firstName.trim();
    const cleanLast = isSingleName ? '' : lastName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    const draft = {
      firstName: cleanFirst,
      lastName: cleanLast,
      isSingleName,
      email: cleanEmail,
      phoneCountryCode,
      phone: cleanPhone,
      targetExamIds: selectedExams,
      primaryExamId: primaryExamId || selectedExams[0]!,
      preferredLanguage: 'en' as const,
    };

    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/v1/auth/student/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          otp: otp.trim(),
          registrationDraft: draft,
          deviceInfo: {
            platform: 'web',
            appVersion: '2.0.2',
          },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Incorrect or expired verification code.');
      }

      // Persist verified session
      const token = data.accessToken || data.tokens?.accessToken;
      const user = data.user;
      setStudentSession(user, token);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-indigo-500/30">
            S
          </div>
          <span className="text-2xl font-black tracking-tight text-white">SidPrep</span>
        </Link>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">Create your account</h2>
        <p className="mt-2 text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Log in here
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg px-4 sm:px-0">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 sm:px-10 shadow-2xl rounded-2xl">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span>{error}</span>
                {error.includes('already exists') && (
                  <div className="mt-2">
                    <Link
                      href="/login"
                      className="font-medium text-rose-200 underline hover:text-white"
                    >
                      Go to login &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-3 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {step === 'DETAILS' ? (
            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    First Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. Rahul"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Last Name {!isSingleName && <span className="text-rose-400">*</span>}
                  </label>
                  <input
                    type="text"
                    disabled={isSingleName}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={isSingleName ? 'Single name selected' : 'e.g. Sharma'}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors ${
                      isSingleName ? 'opacity-50 cursor-not-allowed bg-slate-900' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Single Name Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="singleNameToggle"
                  checked={isSingleName}
                  onChange={(e) => {
                    setIsSingleName(e.target.checked);
                    if (e.target.checked) setLastName('');
                  }}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="singleNameToggle" className="text-xs text-slate-400 cursor-pointer select-none">
                  I have only a single name (no legal surname)
                </label>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Mobile Number <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  >
                    <option value="+91">+91 (IN)</option>
                    <option value="+1">+1 (US/CA)</option>
                    <option value="+44">+44 (UK)</option>
                    <option value="+880">+880 (BD)</option>
                    <option value="+977">+977 (NP)</option>
                  </select>
                  <div className="relative flex-1">
                    <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Target Exam Selection from Catalogue */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Target Preparation Exam <span className="text-rose-400">*</span>
                </label>
                <p className="text-xs text-slate-500 mb-2.5">
                  Select your primary and secondary competitive exams from the live catalogue:
                </p>

                {loadingExams ? (
                  <div className="flex items-center justify-center p-6 bg-slate-950 border border-slate-800 rounded-xl">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <span className="ml-2 text-xs text-slate-400">Loading exam catalogue...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                    {catalogueExams.map((exam) => {
                      const isSelected = selectedExams.includes(exam.id);
                      return (
                        <button
                          type="button"
                          key={exam.id}
                          onClick={() => toggleExamSelection(exam.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-200'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border ${
                                isSelected ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-sm font-medium truncate">{exam.title || exam.name}</span>
                          </div>
                          <span className="text-xs font-mono text-slate-500 uppercase ml-2 flex-shrink-0">
                            {exam.body}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Primary Exam Selection if multiple selected */}
              {selectedExams.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Primary Exam Focus <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={primaryExamId}
                    onChange={(e) => setPrimaryExamId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  >
                    {selectedExams.map((examId) => {
                      const match = catalogueExams.find((e) => e.id === examId);
                      return (
                        <option key={examId} value={examId}>
                          {match ? match.title || match.name : examId}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* OTP Step */
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-slate-400">
                  Enter the 6-digit verification code sent to <br />
                  <strong className="text-white">{email}</strong>
                </p>
              </div>

              <div>
                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full tracking-[0.5em] text-center text-3xl font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying and creating profile...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Complete Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('DETAILS');
                    setOtp('');
                    setError(null);
                  }}
                  className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </button>

                <button
                  type="button"
                  disabled={countdown > 0 || loading}
                  onClick={handleRegisterSubmit}
                  className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
                >
                  {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend Code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
