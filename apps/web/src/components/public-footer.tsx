import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-heading font-extrabold text-base">
                S
              </div>
              <span className="font-heading font-bold text-lg text-white">SidPrep 2.0</span>
            </div>
            <p className="text-slate-400 max-w-sm mb-4 leading-relaxed">
              Fast, focused, reliable learning companion for Central & State Government examinations.
              Targeted curriculum, official exam patterns, and daily verified news briefs.
            </p>
            <div className="text-[11px] text-slate-500">
              Zero bloat. Fastify API + Next.js App Router + Cloudflare + PostgreSQL.
            </div>
          </div>

          {/* Target Exams */}
          <div>
            <h4 className="font-heading font-bold text-white text-sm mb-3">Target Exams</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/exams/ssc" className="hover:text-white transition-colors">
                  SSC CGL / CHSL / MTS
                </Link>
              </li>
              <li>
                <Link href="/exams/rrb" className="hover:text-white transition-colors">
                  RRB NTPC & Group D
                </Link>
              </li>
              <li>
                <Link href="/exams/wbpsc" className="hover:text-white transition-colors">
                  WBPSC Clerkship / Food SI
                </Link>
              </li>
              <li>
                <Link href="/exams/ibps" className="hover:text-white transition-colors">
                  IBPS PO & Clerk
                </Link>
              </li>
            </ul>
          </div>

          {/* Learning Features */}
          <div>
            <h4 className="font-heading font-bold text-white text-sm mb-3">Learning Hub</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/current-affairs" className="hover:text-white transition-colors">
                  Daily Current Affairs
                </Link>
              </li>
              <li>
                <Link href="/resources" className="hover:text-white transition-colors">
                  Formula Handbooks & Notes
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-white transition-colors">
                  Sectional & Full Mocks
                </Link>
              </li>
              <li>
                <Link href="/app" className="hover:text-white transition-colors">
                  Android App Download
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Governance */}
          <div>
            <h4 className="font-heading font-bold text-white text-sm mb-3">Governance</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="hover:text-white transition-colors">
                  Official Exam Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="hover:text-white transition-colors">
                  User Data Deletion
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Support & Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer Bar */}
        <div className="pt-8 border-t border-slate-800 text-[11px] text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            &copy; {new Date().getFullYear()} SidPrep Educational Platform. Not affiliated with or endorsed by SSC, RRB, WBPSC, or IBPS.
            Exam syllabi and notices are sourced from respective official government publication portals.
          </div>
          <div className="flex items-center gap-4">
            <span>Brevo Email Verified</span>
            <span>Cloudflare Protected</span>
            <Link href="/admin/login" className="hover:text-slate-300 transition-colors">
              Staff Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
