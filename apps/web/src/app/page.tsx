import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
import {
  CheckCircle2,
  BookOpen,
  Newspaper,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  Sparkles,
  Zap,
  Clock,
  Download,
  AlertCircle,
} from 'lucide-react';

export default function HomePage() {
  const examFamilies = [
    {
      code: 'SSC',
      name: 'Staff Selection Commission',
      exams: 'CGL, CHSL, MTS & GD',
      pattern: 'Tier 1 CBT + Tier 2 Merit',
      badge: 'Verified 2026 Scheme',
      link: '/exams/ssc',
      color: 'border-blue-500/30 hover:border-blue-500',
    },
    {
      code: 'RRB',
      name: 'Railway Recruitment Boards',
      exams: 'NTPC (Graduate & Undergrad), Group D',
      pattern: 'CBT 1 + CBT 2 (1/3rd Negative)',
      badge: 'Official Weightages',
      link: '/exams/rrb',
      color: 'border-emerald-500/30 hover:border-emerald-500',
    },
    {
      code: 'WBPSC',
      name: 'West Bengal Public Service',
      exams: 'Clerkship, Miscellaneous, Food SI',
      pattern: 'Part-I Objective + Part-II Descriptive',
      badge: 'State GK Focus',
      link: '/exams/wbpsc',
      color: 'border-amber-500/30 hover:border-amber-500',
    },
    {
      code: 'IBPS',
      name: 'Banking Personnel Selection',
      exams: 'PO, Clerk, RRB Officer & Assistant',
      pattern: 'Prelims (Sectional 20m) + Mains',
      badge: 'Sectional Timer Lock',
      link: '/exams/ibps',
      color: 'border-purple-500/30 hover:border-purple-500',
    },
  ];

  return (
    <PublicShell>
      <div className="flex flex-col">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-slate-200/80 bg-gradient-to-b from-white via-canvas to-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            {/* Top pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SidPrep 2.0 Greenfield Release — Zero Bloat EdTech</span>
            </div>

            <h1 className="font-heading font-extrabold text-4xl sm:text-5xl md:text-6xl text-slate-900 tracking-tight leading-[1.1] mb-6">
              Prepare with <span className="text-primary underline decoration-primary/30 decoration-wavy">real exam rules</span>, not guesswork.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed max-w-2xl mx-auto">
              Authentic syllabus structures, admin-verified exam patterns, scheduled daily current affairs from official press releases, and an offline-resilient mock runner.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Link
                href="/app"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-sm shadow-md hover:shadow-lg transition-all"
              >
                <Smartphone className="w-4 h-4" />
                Download Android App (.APK)
              </Link>
              <Link
                href="/current-affairs"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-heading font-bold text-sm border border-slate-300 shadow-sm transition-all"
              >
                <Newspaper className="w-4 h-4 text-primary" />
                Read Today’s Current Affairs
              </Link>
            </div>

            {/* Quick Guarantees */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left border-t border-slate-200/60 pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-teal shrink-0" />
                <span className="text-xs font-medium text-slate-600">Dual-Admin Verified Patterns</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-teal shrink-0" />
                <span className="text-xs font-medium text-slate-600">Offline-Safe Answer Sync</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-teal shrink-0" />
                <span className="text-xs font-medium text-slate-600">PIB & Official Press News</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-teal shrink-0" />
                <span className="text-xs font-medium text-slate-600">No Paywalled Traps</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. EXAM FAMILIES SELECTOR */}
      <section className="py-16 md:py-24 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Official Portals</span>
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 mt-1">
                Target Your Government Examination
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-2 md:mt-0">
              Exam patterns and syllabus topic weightages are strictly synchronized with authoritative official notices.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {examFamilies.map((fam) => (
              <Link
                key={fam.code}
                href={fam.link}
                className={`group flex flex-col p-6 rounded-2xl bg-canvas border transition-all hover:shadow-md hover:-translate-y-0.5 ${fam.color}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-heading font-black text-2xl text-slate-900 group-hover:text-primary transition-colors">
                    {fam.code}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-accent-teal border border-emerald-200">
                    {fam.badge}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-sm text-slate-800 mb-1">{fam.name}</h3>
                <p className="text-xs text-slate-500 mb-3">{fam.exams}</p>
                <div className="mt-auto pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-slate-600 group-hover:text-primary">
                  <span>{fam.pattern}</span>
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FOUR CORE CAPABILITIES */}
      <section className="py-16 md:py-24 bg-canvas border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Architecture That Matters</span>
            <h2 className="font-heading font-extrabold text-3xl text-slate-900 mt-1">
              Built for Learning Integrity
            </h2>
            <p className="text-sm text-slate-600 mt-3">
              Engineered to eliminate fake countdowns, unverified questions, and answer key leaks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-7 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-5">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-2">Authoritative Mock Runner</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Test timer, negative marking (0.25, 0.33, or 0.50), and section locks are strictly evaluated on the server. Answer keys and solutions are NEVER exposed before final submission.
              </p>
              <div className="mt-auto pt-3 border-t border-slate-100 text-[11px] font-semibold text-accent-teal flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Monotonic offline answer sync
              </div>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-accent-teal flex items-center justify-center mb-5">
                <Newspaper className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-2">Automated Current Affairs</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Scheduled 05:30 IST collection from authorized PIB and government press releases. Deduplicated via SHA-256 hashes with concise, original summaries and verified exam tags.
              </p>
              <div className="mt-auto pt-3 border-t border-slate-100 text-[11px] font-semibold text-accent-teal flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Editorial review before publishing
              </div>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-accent-amber flex items-center justify-center mb-5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-2">Safe Resource Viewing</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Instant browser & in-app previews for formulas, notes, and PDF handouts. Direct file download is strictly controlled by admin policy with short-lived signed URLs.
              </p>
              <div className="mt-auto pt-3 border-t border-slate-100 text-[11px] font-semibold text-accent-teal flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Magic-byte sanitization
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HONEST FREQUENTLY ASKED QUESTIONS */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
              Clear Answers About SidPrep 2.0
            </h2>
          </div>

          <div className="space-y-4">
            <div className="p-5 rounded-xl border border-slate-200 bg-canvas">
              <h4 className="font-heading font-bold text-sm text-slate-900 mb-1">
                Where do SidPrep’s exam patterns and syllabi come from?
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Directly from official government gazettes, recruitment notices (SSC, RRB, WBPSC, IBPS), and authoritative notifications. Every pattern change undergoes dual-admin review and includes the source URL and verification date.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-canvas">
              <h4 className="font-heading font-bold text-sm text-slate-900 mb-1">
                How does offline mock synchronization work?
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                When you answer questions in the companion student mobile app during unstable network conditions, responses are queued locally in SQLite with monotonic sequence numbers. As soon as connectivity resumes, the batch is transactionally synced to `/v1/sync/answers`.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-canvas">
              <h4 className="font-heading font-bold text-sm text-slate-900 mb-1">
                Why email OTP instead of phone SMS?
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                We use secure transactional email OTP powered by Brevo. This avoids SMS carrier delivery failures and keeps the platform running within verified free-tier operational limits without requiring paywalls or advertisements.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
    </PublicShell>
  );
}
