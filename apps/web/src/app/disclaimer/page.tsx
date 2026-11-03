import { PublicShell } from '@/components/public-shell';

export default function DisclaimerPage() {
  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl text-slate-900 mb-6">
          Official Government Exam Disclaimer
        </h1>
        <div className="prose prose-slate text-sm leading-relaxed space-y-5 text-slate-700">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
            <strong>Important Notice:</strong> SidPrep is an independent educational technology platform. It is not affiliated with, authorized by, endorsed by, or in any way officially connected with the Staff Selection Commission (SSC), Railway Recruitment Boards (RRB), West Bengal Public Service Commission (WBPSC), or Institute of Banking Personnel Selection (IBPS).
          </div>
          <p className="text-xs">
            Official recruitment notifications, schedules, syllabus guidelines, and examination results are published exclusively on official government websites:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs">
            <li>SSC: <a href="https://ssc.gov.in" target="_blank" rel="noopener noreferrer" className="text-primary underline">https://ssc.gov.in</a></li>
            <li>Indian Railways: <a href="https://indianrailways.gov.in" target="_blank" rel="noopener noreferrer" className="text-primary underline">https://indianrailways.gov.in</a></li>
            <li>WBPSC: <a href="https://psc.wb.gov.in" target="_blank" rel="noopener noreferrer" className="text-primary underline">https://psc.wb.gov.in</a></li>
            <li>IBPS: <a href="https://ibps.in" target="_blank" rel="noopener noreferrer" className="text-primary underline">https://ibps.in</a></li>
          </ul>
          <p className="text-xs">
            All trademarks, registered marks, and commission names mentioned are property of their respective official bodies.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
