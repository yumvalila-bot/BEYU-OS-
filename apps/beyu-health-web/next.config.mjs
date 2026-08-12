/**
 * Health OS web talks to NestJS over HTTP.
 * It must never receive SUPABASE_SECRET_KEY, DATABASE_URL, or JWT_SECRET.
 * Do not bake localhost into production bundles via the `env` key.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT || undefined,
  async rewrites() {
    const api = process.env.HEALTH_API_INTERNAL_URL || 'http://127.0.0.1:4001';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
