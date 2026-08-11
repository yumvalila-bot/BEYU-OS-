/**
 * BEYU OS — JWT issuance/verification using HMAC-SHA256.
 *
 * Implemented with Node's crypto primitives (no external dependency) and
 * constant-time signature comparison. OIDC-ready: `iss`/`aud`/`sub` claims are
 * standard, so an external identity provider can replace this issuer without
 * changing consumers (spec §17, §58).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti?: string;
  /** BEYU canonical identity id. */
  idt?: string;
  email?: string;
  roles?: string[];
  tenants?: string[];
  activeTenant?: string | null;
  osIds?: string[];
  mfa?: boolean;
  svc?: boolean;
  [claim: string]: unknown;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(claims: JwtClaims, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export type JwtVerification =
  | { valid: true; claims: JwtClaims }
  | { valid: false; reason: string };

export function verifyJwt(token: string, secret: string, audience?: string): JwtVerification {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'Malformed token.' };

  const [header, payload, signature] = parts;

  let parsedHeader: { alg?: string };
  try {
    parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed token header.' };
  }
  // Reject "alg: none" and algorithm-confusion attacks explicitly.
  if (parsedHeader.alg !== 'HS256') {
    return { valid: false, reason: `Unsupported token algorithm: ${parsedHeader.alg}` };
  }

  const expected = sign(`${header}.${payload}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'Invalid token signature.' };
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed token payload.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= now) {
    return { valid: false, reason: 'Token has expired.' };
  }
  if (audience && claims.aud !== audience) {
    return { valid: false, reason: 'Token audience mismatch.' };
  }

  return { valid: true, claims };
}
