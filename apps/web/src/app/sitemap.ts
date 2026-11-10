import { MetadataRoute } from 'next';
import { getServerApiUrl } from '@/lib/api-server';

/**
 * Authoritative sitemap.xml generator for SidPrep (F32)
 * Removes nonexistent routes (e.g. /help), includes all published CMS articles dynamically,
 * and preserves accurate lastModified timestamps.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://sidprep.in';
  const currentDate = new Date().toISOString();

  // Canonical existing public static routes (removed nonexistent /help)
  const staticRoutes = [
    '',
    '/features',
    '/exams/ssc',
    '/exams/rrb',
    '/exams/wbpsc',
    '/exams/ibps',
    '/current-affairs',
    '/resources',
    '/app',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/disclaimer',
    '/data-deletion',
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: currentDate,
    changeFrequency: route.includes('current-affairs') ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : route.startsWith('/exams') ? 0.9 : 0.7,
  }));

  // Dynamically include published CMS pages
  try {
    const apiBase = getServerApiUrl();
    const res = await fetch(`${apiBase}/pages`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data?.pages && Array.isArray(data.pages)) {
        const cmsEntries: MetadataRoute.Sitemap = data.pages.map((p: any) => ({
          url: `${baseUrl}/p/${p.slug}`,
          lastModified: p.updatedAt ? new Date(p.updatedAt).toISOString() : currentDate,
          changeFrequency: 'weekly',
          priority: 0.6,
        }));
        return [...staticEntries, ...cmsEntries];
      }
    }
  } catch {
    // Graceful fallback to static routes if API is offline during initial build
  }

  return staticEntries;
}
