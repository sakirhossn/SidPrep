/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' || process.platform === 'linux' ? 'standalone' : undefined,
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: http://localhost:* ws://localhost:*; frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const rawApiUrl = process.env.INTERNAL_API_URL || process.env.API_URL || 'http://localhost:4000/v1';
    const apiBase = rawApiUrl.replace(/\/v1\/?$/, '');
    return [
      {
        source: '/v1/:path*',
        destination: `${apiBase}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
