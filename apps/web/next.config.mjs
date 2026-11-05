/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
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
