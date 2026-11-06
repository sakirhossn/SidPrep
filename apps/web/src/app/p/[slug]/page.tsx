import { notFound } from 'next/navigation';
import { PublicShell } from '@/components/public-shell';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface DynamicPageProps {
  params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
  try {
    const res = await fetch(`${API_BASE}/v1/pages/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function DynamicCMSPage({ params }: DynamicPageProps) {
  const { slug } = await params;
  const page = await getPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mb-3">
          {page.title}
        </h1>
        {page.subtitle && (
          <p className="text-base text-slate-600 mb-8 leading-relaxed font-medium">
            {page.subtitle}
          </p>
        )}
        <div
          className="prose prose-slate max-w-none text-sm leading-relaxed space-y-5 text-slate-700"
          dangerouslySetInnerHTML={{ __html: page.contentHtml }}
        />
      </div>
    </PublicShell>
  );
}
