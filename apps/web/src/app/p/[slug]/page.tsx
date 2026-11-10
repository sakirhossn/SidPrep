import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicShell } from '@/components/public-shell';
import { getServerApiUrl } from '@/lib/api-server';

interface DynamicPageProps {
  params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
  try {
    const apiBase = getServerApiUrl();
    const res = await fetch(`${apiBase}/pages/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Dynamic SEO metadata generator for published CMS articles (F32)
 * Surfaces stored seoTitle and seoDescription to search engine and social crawlers.
 */
export async function generateMetadata({ params }: DynamicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) {
    return {
      title: 'Page Not Found | SidPrep',
    };
  }

  const title = page.seoTitle || page.metaTitle || `${page.title} | SidPrep`;
  const description = page.seoDescription || page.metaDescription || page.subtitle || `Read ${page.title} on SidPrep Educational Platform`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://sidprep.in/p/${slug}`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `https://sidprep.in/p/${slug}`,
    },
  };
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
