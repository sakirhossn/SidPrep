import { PublicShell } from '@/components/public-shell';

export default function ContactPage() {
  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl text-slate-900 mb-4">
          Contact & Learner Support
        </h1>
        <p className="text-sm text-slate-600 mb-8 leading-relaxed">
          Have questions regarding syllabus updates, report an erratum in a question, or need account assistance?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Editorial & Errata</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              If you notice an error in an official question or answer explanation, please report it to our content review desk:
            </p>
            <div className="text-xs font-mono font-semibold text-primary">
              editorial@sidprep.in
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Technical & Accounts</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              For login issues, Brevo OTP delivery questions, or privacy data requests:
            </p>
            <div className="text-xs font-mono font-semibold text-primary">
              support@sidprep.in
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
