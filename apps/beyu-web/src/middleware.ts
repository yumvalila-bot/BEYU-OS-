import { NextResponse } from 'next/server';

/**
 * Runtime security headers.
 *
 * These live here rather than in next.config.mjs because `headers()` is
 * evaluated when the app is built and baked into the route manifest. An
 * operator must be able to tighten or loosen framing for a given deployment
 * without producing a new build — a security control you can only change by
 * rebuilding is one that gets left wrong.
 *
 * A control plane that can move capital must not be framable by another site,
 * so framing is denied unless a deployment explicitly opts in (a development
 * preview that renders the app in an iframe is the one legitimate case).
 * `frame-ancestors` is the modern control; X-Frame-Options is sent alongside
 * it for older browsers, and only when framing is denied — the two cannot
 * express "allow" consistently.
 */
export function middleware(): NextResponse {
  const response = NextResponse.next();

  if (process.env.BEYU_ALLOW_EMBEDDING === 'true') {
    response.headers.set('content-security-policy', 'frame-ancestors *');
    response.headers.delete('x-frame-options');
  } else {
    response.headers.set('content-security-policy', "frame-ancestors 'self'");
    response.headers.set('x-frame-options', 'SAMEORIGIN');
  }

  return response;
}

export const config = {
  // Static assets carry no session and no framing risk worth the per-request
  // cost of running middleware on them.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
