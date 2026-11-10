import { PublicShell } from '@/components/public-shell';
import { getServerApiUrl } from '@/lib/api-server';

async function getAboutContent() {
  try {
    const apiBase = getServerApiUrl();
    const res = await fetch(`${apiBase}/pages/about`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function AboutPage() {
  const dynamicPage = await getAboutContent();

  if (dynamicPage && dynamicPage.contentHtml) {
    return (
      <PublicShell>
        <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mb-3">
            {dynamicPage.title}
          </h1>
          {dynamicPage.subtitle && (
            <p className="text-base text-slate-600 mb-8 leading-relaxed font-medium">
              {dynamicPage.subtitle}
            </p>
          )}
          <div
            className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 text-slate-700"
            dangerouslySetInnerHTML={{ __html: dynamicPage.contentHtml }}
          />
        </div>
      </PublicShell>
    );
  }

  // Static Fallback
  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mb-6">
          About SidPrep 2.0
        </h1>
        <div className="prose prose-slate text-sm leading-relaxed space-y-6 text-slate-700">
          <p>
            SidPrep was created to provide serious competitive exam candidates (SSC, RRB, WBPSC, IBPS) with a trustworthy, distraction-free preparation platform.
          </p>
          <h3 className="font-heading font-bold text-lg text-slate-900">Why SidPrep 2.0 was rebuilt from scratch</h3>
          <p>
            Many online test preparation apps suffer from advertising bloat, questionable question accuracy, fabricated exam dates, and unstable test runners. SidPrep 2.0 was completely rebuilt from a greenfield codebase using modern software principles:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Zero Fabricated Dates:</strong> We only display exam dates and cutoffs that have been officially published in government gazettes or commission notices.</li>
            <li><strong>Dual-Admin Governance:</strong> Every pattern change must be independently verified by a second administrator.</li>
            <li><strong>Verified Current Affairs:</strong> Sourced strictly from PIB and accredited official releases, summarized concisely with clear citations.</li>
            <li><strong>Respect for Student Privacy:</strong> No invasive tracking SDKs or marketing spam.</li>
          </ul>
          <h3 className="font-heading font-bold text-lg text-slate-900">Infrastructure and Free-Tier Discipline</h3>
          <p>
            SidPrep 2.0 runs reliably within sustainable free-tier infrastructure (Oracle Cloud Always Free ARM64 compute, Cloudflare security, and Brevo transactional email). We design our architecture conservatively so that learners enjoy high availability without cost-induced shutdowns.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
