import { CheckCircle2, Shield, Smartphone, Zap, Clock, BookOpen, Layers } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

export default function FeaturesPage() {
  const features = [
    {
      title: 'Real Computer-Based Test (CBT) Runner',
      description: 'Faithfully replicates official exam interfaces for SSC, Railway, and Banking exams with section palettes, mark-for-review, clear response, and monotonic answer tracking.',
      details: ['Sectional timers & section locks (IBPS format)', 'Official negative marking ratios (0.25, 0.33, 0.50, 1.0)', 'Answers protected on server until final submission'],
    },
    {
      title: 'Monotonic Offline Synchronization',
      description: 'Prepare and practice without worrying about patchy network connections. Your answers are sequenced transactionally and synced automatically when back online.',
      details: ['SQLite-backed offline answer queue', 'Monotonic client sequence numbers to prevent overwrite conflicts', 'Clear indicators: Saved Locally vs Synced to Server'],
    },
    {
      title: 'Scheduled Current Affairs (05:30 IST)',
      description: 'Automated ingestion from Press Information Bureau (PIB) and official government press releases, classified into Polity, Economy, Banking, Schemes, and Railways.',
      details: ['Concise, original fact-checked summaries', 'Primary source citations on every article', 'Filtered specifically for SSC, RRB, WBPSC, and IBPS'],
    },
    {
      title: 'Safe Resource Previews & Controlled Downloads',
      description: 'Formula handbooks, quick revision sheets, and previous year papers with immediate in-browser previews and strict administrative download controls.',
      details: ['Server-side sanitized HTML preview for DOCX', 'In-browser PDF viewer metadata', 'Short-lived signed download tokens for authorized materials'],
    },
    {
      title: 'Dual-Admin Verified Exam Blueprints',
      description: 'No fabricated dates or syllabus changes. Every exam pattern modification requires two separate administrators to review and approve against official notifications.',
      details: ['Official notification source URL attached to every exam', 'Topic-by-topic percentage weightages', 'Verification date visible to students'],
    },
    {
      title: 'Zero-Bloat, Ad-Free Architecture',
      description: 'Engineered for speed and focus. No ads, no popups, no expensive paywalled traps, and no battery-draining background trackers.',
      details: ['Fastify API (~45MB memory footprint)', 'Static-first Next.js marketing pages', 'Brevo transactional email OTP authentication'],
    },
  ];

  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mb-16">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Capabilities</span>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 mb-4">
          Engineered for Exam Precision
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          Every capability in SidPrep 2.0 is built to reflect the exact operational reality of official competitive recruitment tests in India.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {features.map((f, idx) => (
          <div key={idx} className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
            <h3 className="font-heading font-bold text-xl text-slate-900 mb-3">{f.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">{f.description}</p>
            <div className="mt-auto space-y-2.5 pt-4 border-t border-slate-100">
              {f.details.map((d, dIdx) => (
                <div key={dIdx} className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-accent-teal shrink-0" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    </PublicShell>
  );
}
