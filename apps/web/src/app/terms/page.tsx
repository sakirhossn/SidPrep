import { PublicShell } from '@/components/public-shell';

export default function TermsPage() {
  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl text-slate-900 mb-6">
          Terms of Service
        </h1>
        <div className="prose prose-slate text-sm leading-relaxed space-y-5 text-slate-700">
          <p><strong>Last Updated:</strong> November 2026</p>
          <p>
            By creating an account or accessing SidPrep learning services, you agree to these Terms of Service.
          </p>
          <h3 className="font-heading font-bold text-base text-slate-900">1. Fair Use of Learning Materials</h3>
          <p className="text-xs">
            All test questions, explanations, formulas, and resources provided on SidPrep are for your personal educational use only. You agree not to scrape, distribute, or reverse engineer the API or test runner.
          </p>
          <h3 className="font-heading font-bold text-base text-slate-900">2. Examination Rules</h3>
          <p className="text-xs">
            SidPrep accurately models official government exam patterns, but official government commission rules always remain supreme.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
