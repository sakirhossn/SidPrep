'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap,
  Flame,
  Clock,
  BookOpen,
  Newspaper,
  HardDrive,
  CheckCircle,
  ArrowRight,
  LogOut,
  Target,
  Sparkles,
  User,
} from 'lucide-react';
import { PublicShell } from '@/components/public-shell';
import { getStudentUser, clearStudentSession, StudentUser } from '@/lib/auth';
import { StudentProfileModal } from '@/components/StudentProfileModal';

export default function StudentDashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const user = getStudentUser();
    if (!user) {
      router.push('/login');
    } else {
      setStudent(user);
    }
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    clearStudentSession();
    router.push('/login');
  };

  if (loading) {
    return (
      <PublicShell>
        <div className="py-24 text-center text-slate-500">Loading student workspace...</div>
      </PublicShell>
    );
  }

  if (!student) return null;

  return (
    <PublicShell>
      <div className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-[#1E3C2C] to-[#28563F] rounded-3xl p-8 text-white shadow-xl mb-8 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#DFF19B] text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Active Candidate Session
              </div>
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
                Welcome back, {student.email.split('@')[0]}
              </h1>
              <p className="text-sm text-slate-200 mt-1">
                Your preparation targets: <span className="font-bold text-[#DFF19B]">SSC CGL 2026 • RRB NTPC • WBPSC</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowProfile(true)}
                className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold flex items-center gap-2 transition-all"
              >
                <User className="w-4 h-4" /> Profile &amp; Account
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Profile Modal */}
        <StudentProfileModal
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
          student={student}
          onProfileUpdated={(updated) => setStudent(updated)}
        />

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Preparation Streak</span>
              <Flame className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-heading font-extrabold text-slate-900">
              {student.streakDays || 1} <span className="text-sm font-normal text-slate-500">Day(s)</span>
            </div>
            <p className="text-xs text-emerald-600 mt-2 font-medium">Keep your study momentum going</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Daily Goal</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-heading font-extrabold text-slate-900">
              {student.dailyGoalMinutes || 45} <span className="text-sm font-normal text-slate-500">Mins</span>
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Standard exam revision quota</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Account Status</span>
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-2xl font-heading font-extrabold text-slate-900">
              Verified
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Brevo OTP authenticated</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Language</span>
              <BookOpen className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-2xl font-heading font-extrabold text-slate-900">
              English / Hindi
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Multilingual test palette</p>
          </div>
        </div>

        {/* Modules Navigation */}
        <h2 className="font-heading font-bold text-lg text-slate-900 mb-5">
          Preparation Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1E3C2C] flex items-center justify-center mb-4">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-900 mb-1">
                Official Exam Patterns
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Practice Tier 1 & Tier 2 mocks with official timing and negative marking (+2.0 / -0.5).
              </p>
            </div>
            <Link
              href="/exams/ssc"
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-700"
            >
              Browse Exam Series <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                <Newspaper className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-900 mb-1">
                Daily Verified Current Affairs
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Fact-checked news digests with official PIB citations and key examination facts.
              </p>
            </div>
            <Link
              href="/current-affairs"
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-700"
            >
              Read Today's Briefs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-4">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-900 mb-1">
                Documents & Resources
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Curated PDF formula summaries, static GK charts, and official previous-year papers.
              </p>
            </div>
            <Link
              href="/resources"
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-700"
            >
              Access Resource Vault <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
