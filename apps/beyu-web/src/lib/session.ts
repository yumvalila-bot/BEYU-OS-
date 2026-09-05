/**
 * Server-side session handling.
 * Next.js 15+ cookies() is async — all helpers are async to support both versions.
 * Tokens live in httpOnly, sameSite=strict cookies, never in page payload.
 */

import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'beyu_at';
export const REFRESH_COOKIE = 'beyu_rt';

const secure = process.env.NODE_ENV === 'production';

export interface SessionUser {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
}

export async function readAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function writeSession(tokens: TokenPair): Promise<void> {
  const jar = await cookies();
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
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

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
