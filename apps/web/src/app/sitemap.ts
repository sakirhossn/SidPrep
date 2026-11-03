import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://sidprep.in';
  const currentDate = new Date().toISOString();

  const routes = [
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
    '/help',
    '/privacy',
    '/terms',
    '/disclaimer',
    '/data-deletion',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: currentDate,
    changeFrequency: route.includes('current-affairs') ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : route.startsWith('/exams') ? 0.9 : 0.7,
  }));
}
