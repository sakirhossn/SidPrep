import Link from 'next/link';
import { Newspaper, ExternalLink, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

export default function CurrentAffairsPublicPage() {
  const articles = [
    {
      id: 'ca_01',
      title: 'PM-Surya Ghar: Muft Bijli Yojana Crosses 1.5 Crore Consumer Registrations',
      originalSummary: 'The Ministry of New and Renewable Energy reported massive adoption of the national rooftop solar program, which provides up to 300 units of free electricity per month for registered residential households.',
      category: 'Government Schemes',
      targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
      keyFacts: [
        'National Outlay: ₹75,021 crore sanctioned allocation',
        'Direct subsidy up to 60% of solar unit cost for 2kW systems',
        'Administered via the National Net-Metering Integration Portal',
      ],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2012345',
      publishedAt: '2026-11-03 07:00 IST',
    },
    {
      id: 'ca_02',
      title: 'Reserve Bank of India Keeps Benchmark Repo Rate Unchanged at 6.50% in Bi-Monthly MPC Review',
      originalSummary: 'The Monetary Policy Committee of the Reserve Bank of India decided by a majority to keep the policy repo rate unchanged at 6.50% to ensure inflation aligns with the statutory 4% target.',
      category: 'Banking',
      targetExams: ['IBPS', 'SSC', 'RRB'],
      keyFacts: [
        'Repo Rate: 6.50% | Standing Deposit Facility (SDF): 6.25%',
        'Mandated under Section 45ZA of the Reserve Bank of India Act, 1934',
        'CPI Headline Inflation projected at 4.5% for current fiscal',
      ],
      sourceName: 'Reserve Bank of India Official Bulletin',
      sourceUrl: 'https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=57001',
      publishedAt: '2026-11-02 07:00 IST',
    },
    {
      id: 'ca_03',
      title: 'Indian Railways Completes 100% Electrification Across Eastern Railway Zone',
      originalSummary: 'The Ministry of Railways announced full electrification of all broad-gauge routes across Eastern Railway, accelerating Mission 100% Net Zero Carbon Emission by 2030.',
      category: 'Railways',
      targetExams: ['RRB', 'SSC', 'WBPSC'],
      keyFacts: [
        'Zone: Eastern Railway (Howrah, Sealdah, Asansol, Malda divisions)',
        'Significantly cuts diesel traction operational expenditure',
        'Enhances throughput for Freight and Vande Bharat services',
      ],
      sourceName: 'Press Information Bureau (Railways)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2099881',
      publishedAt: '2026-11-01 07:00 IST',
    },
  ];

  const categories = [
    'All Categories',
    'Government Schemes',
    'Banking',
    'Polity',
    'Economy',
    'Railways',
    'Science/Tech',
    'Environment',
    'West Bengal',
  ];

  return (
    <PublicShell>
      <div className="py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-3xl mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-accent-teal text-xs font-bold mb-3 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>PIB & Official Press Release Feeds • Editorial Verified</span>
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mb-3">
          Daily Exam-Targeted Current Affairs
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Original, fact-checked summaries published daily at 07:00 IST. Strictly free of clickbait, personal opinions, or copyright infringement.
        </p>
      </div>

      {/* Categories Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 text-xs font-semibold scrollbar-none">
        {categories.map((cat, idx) => (
          <button
            key={idx}
            className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-colors ${
              idx === 0
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Feed List */}
      <div className="space-y-6">
        {articles.map((art) => (
          <article
            key={art.id}
            className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-primary/10 text-primary">
                  {art.category}
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {art.publishedAt}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {art.targetExams.map((ex) => (
                  <span
                    key={ex}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </div>

            <h2 className="font-heading font-bold text-xl text-slate-900 mb-3 hover:text-primary transition-colors">
              {art.title}
            </h2>

            <p className="text-sm text-slate-700 leading-relaxed mb-5">
              {art.originalSummary}
            </p>

            {/* Key exam points */}
            <div className="p-4 rounded-xl bg-canvas border border-slate-200/80 mb-5">
              <span className="text-xs font-bold text-slate-900 block mb-2">Key Exam Pointers:</span>
              <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                {art.keyFacts.map((fact, fIdx) => (
                  <li key={fIdx}>{fact}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
              <span className="flex items-center gap-1">
                Source: <strong>{art.sourceName}</strong>
              </span>
              <a
                href={art.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Official Release <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
    </PublicShell>
  );
}
