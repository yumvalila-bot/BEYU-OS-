/**
 * Server-side session handling.
 *
 * Access and refresh tokens live in httpOnly, sameSite=strict cookies. They
 * are never serialised into a page payload and never readable from client
 * JavaScript, so a cross-site script cannot exfiltrate a session the way it
 * could with localStorage. Everything in this file runs on the server only.
 */

import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'beyu_at';
export const REFRESH_COOKIE = 'beyu_rt';

/** Deployments behind TLS get Secure cookies; local http development cannot. */
const secure = process.env.NODE_ENV === 'production';

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
}

export function readAccessToken(): string | null {
  return cookies().get(ACCESS_COOKIE)?.value ?? null;
}

export function readRefreshToken(): string | null {
  return cookies().get(REFRESH_COOKIE)?.value ?? null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function writeSession(tokens: TokenPair): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: tokens.expiresIn,
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    // Refresh tokens rotate on every use; the API owns their real lifetime.
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearSession(): void {
  const jar = cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/**
 * Decodes the JWT payload for display purposes only.
 *
 * This is NOT verification. The signature is checked by the API on every
 * request; nothing here grants access. It exists so the shell can render a
 * name and role chips without an extra round trip, and it must never be used
 * to decide whether an action is permitted — that decision belongs to the
 * backend, which is the only place it cannot be bypassed.
 */
export function decodeForDisplay(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const payload = Buffer.from(segments[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}
