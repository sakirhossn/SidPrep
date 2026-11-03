import { MetadataRoute } from 'next';

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
          '/help',
          '/privacy',
          '/terms',
          '/disclaimer',
          '/data-deletion',
        ],
        disallow: [
          '/admin/',
          '/admin/*',
          '/api/',
          '/_next/',
          '/drafts/',
        ],
      },
    ],
    sitemap: 'https://sidprep.in/sitemap.xml',
  };
}
