/**
 * The browser never talks to the API host directly, and never holds a token.
 *
 * Every page in this app is a server component: it calls the API from the
 * Next server via src/lib/api.ts, which reads the access token from the
 * httpOnly session cookie. Nothing renders an API origin into client
 * JavaScript, so there is no cross-origin call to configure and no token for
 * a script on the page to steal. There is deliberately no /api/v1 rewrite —
 * a plain rewrite would forward requests unauthenticated, and the alternative
 * of exposing the token to the browser is the thing this design avoids.
 */

/**
 * Framing policy is NOT set here. `headers()` is evaluated at build time and
 * baked into the route manifest, so an operator could not change it without a
 * rebuild. It lives in src/middleware.ts, which reads the environment on every
 * request. The headers below are constant for every deployment, so baking them
 * in is correct.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
