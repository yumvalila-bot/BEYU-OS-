/**
 * BEYU OS — Password hashing and constant-time comparison.
 *
 * Uses Node's built-in scrypt (memory-hard KDF) so no native dependency is
 * required. Production deployments may swap in argon2id via the same API.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // 2^14
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

/** Hashes a password. Returns a self-describing string safe to store. */
export function hashPassword(password: string): string {
  if (!password || password.length < 12) {
    throw new Error('Password must be at least 12 characters.');
  }
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Verifies a password in constant time. Never throws on malformed input. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, nRaw, rRaw, pRaw, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = scryptSync(password, salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
    });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Generates a cryptographically secure random token (URL-safe). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest. */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Redacts sensitive values from an object before logging (spec §58).
 * Never log secrets, tokens or credentials.
 */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'privatekey',
  'clientsecret',
  'mfasecret',
];

export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase().replace(/[_-]/g, ''))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSecrets(v, depth + 1);
    }
  }
  return out as T;
}
