/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_OUTPUT ?? undefined,
  env: {
    NEXT_PUBLIC_HEALTH_API_URL: process.env.NEXT_PUBLIC_HEALTH_API_URL ?? 'http://localhost:4001',
  },
};
export default nextConfig;
