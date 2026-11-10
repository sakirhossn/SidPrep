import { MetadataRoute } from 'next';

/**
 * Authoritative robots.txt configuration for SidPrep (F32)
 * Eliminates duplicate static file, allows crawler rendering of assets, and excludes internal routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/features',
          '/exams/',
          '/current-affairs',
          '/resources',
          '/app',
          '/about',
          '/contact',
          '/privacy',
          '/terms',
          '/disclaimer',
          '/data-deletion',
          '/p/',
        ],
        disallow: [
          '/admin/',
          '/admin/*',
          '/api/',
          '/dashboard/',
          '/drafts/',
        ],
      },
    ],
    sitemap: 'https://sidprep.in/sitemap.xml',
  };
}
