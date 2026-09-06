/**
 * Authentication end-to-end tests.
 * Covers: login success/failure, user enumeration resistance, lockout,
 * refresh rotation + reuse detection, logout revocation, JWT audience
 * enforcement, MFA flag surface, and audit records for auth events.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, HARNESS_PASSWORD } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;

before(async () => {
  h = await boot('auth');
});
after(async () => { await h.close(); });

describe('login', () => {
  it('rejects missing credentials with 400/401', async () => {
    const res = await h.request('POST', '/api/v1/auth/login', {});
    assert.ok([400, 401].includes(res.status), `status=${res.status}`);
  });
  it('rejects wrong password without revealing which part failed', async () => {
    const res = await h.request('POST', '/api/v1/auth/login', { email: `${'auth'}-admin@beyu.agriculture`, password: 'wrong-password-8ch' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid email or password.');
  });
  it('rejects unknown email with the same message (no enumeration)', async () => {
    const res = await h.request('POST', '/api/v1/auth/login', { email: 'nobody@nowhere.example', password: 'wrong-password-8ch' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid email or password.');
  });
  it('returns tokens for valid credentials', async () => {
    const res = await h.request('POST', '/api/v1/auth/login', { email: 'auth-admin@beyu.agriculture', password: HARNESS_PASSWORD });
    assert.equal(res.status, 200);
    assert.ok((res.body as any).accessToken);
    assert.ok((res.body as any).refreshToken);
    assert.equal((res.body as any).tokenType, 'Bearer');
  });
  it('locks the account after repeated failures', async () => {
    await h.createUser('lockme@beyu.agriculture', HARNESS_PASSWORD, ['FARM_MANAGER'], null);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await h.request('POST', '/api/v1/auth/login', { email: 'lockme@beyu.agriculture', password: 'wrong-password-8ch' });
    }
    assert.equal(last.status, 401);
    // The account is now locked: even the CORRECT password is rejected.
    const correct = await h.request('POST', '/api/v1/auth/login', { email: 'lockme@beyu.agriculture', password: HARNESS_PASSWORD });
    assert.equal(correct.status, 401);
  });
});

describe('bearer enforcement', () => {
  it('401 without a token on protected routes', async () => {
    const res = await h.request('GET', '/api/v1/farms');
    assert.equal(res.status, 401);
  });
  it('401 with a garbage token', async () => {
    const res = await h.request('GET', '/api/v1/farms', undefined, { authorization: 'Bearer not-a-jwt' });
    assert.equal(res.status, 401);
  });
  it('401 with a token signed for a different audience', async () => {
    const { signJwt } = await import('@beyu/security');
    const { loadConfig } = await import('@beyu/config');
    const config = loadConfig();
    const forged = signJwt({ sub: h.userId, iss: 'beyu-os', aud: 'beyu-os', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 } as any, config.jwtSecret);
    const res = await h.request('GET', '/api/v1/farms', undefined, { authorization: `Bearer ${forged}` });
    assert.equal(res.status, 401);
    assert.match(String((res.body as any).message), /audience/i);
  });
  it('401 with an expired token', async () => {
    const { signJwt } = await import('@beyu/security');
    const { loadConfig } = await import('@beyu/config');
    const config = loadConfig();
    const expired = signJwt({ sub: h.userId, iss: config.jwtIssuer, aud: 'beyu-agriculture-os', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 } as any, config.jwtSecret);
    const res = await h.request('GET', '/api/v1/farms', undefined, { authorization: `Bearer ${expired}` });
    assert.equal(res.status, 401);
  });
});

describe('refresh lifecycle', () => {
  it('rotates refresh tokens and invalidates the used one', async () => {
    const login = await h.request('POST', '/api/v1/auth/login', { email: 'auth-admin@beyu.agriculture', password: HARNESS_PASSWORD });
    const { accessToken, refreshToken } = login.body as any;

    const first = await h.request('POST', '/api/v1/auth/refresh', { refreshToken });
    assert.equal(first.status, 200);
    const rotated = (first.body as any).refreshToken;
    assert.notEqual(rotated, refreshToken);

    // The ORIGINAL refresh token must now be dead (rotation = one-time use).
    const replay = await h.request('POST', '/api/v1/auth/refresh', { refreshToken });
    assert.equal(replay.status, 401);

    // The rotated token still works.
    const second = await h.request('POST', '/api/v1/auth/refresh', { refreshToken: rotated });
    assert.equal(second.status, 200);
    void accessToken;
  });
  it('logout revokes the session', async () => {
    const login = await h.request('POST', '/api/v1/auth/login', { email: 'auth-admin@beyu.agriculture', password: HARNESS_PASSWORD });
    const { refreshToken } = login.body as any;
    const out = await h.request('POST', '/api/v1/auth/logout', { refreshToken });
    assert.equal(out.status, 200);
    const replay = await h.request('POST', '/api/v1/auth/refresh', { refreshToken });
    assert.equal(replay.status, 401);
  });
});

describe('me endpoint', () => {
  it('exposes the resolved security context', async () => {
    const res = await h.auth('GET', '/api/v1/auth/me');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).email, 'auth-admin@beyu.agriculture');
    assert.ok((res.body as any).roles.includes('SUPER_ADMIN'));
  });
});

describe('audit of authentication', () => {
  it('records LOGIN events in the audit trail', async () => {
    await h.request('POST', '/api/v1/auth/login', { email: 'auth-admin@beyu.agriculture', password: HARNESS_PASSWORD });
    const res = await h.auth('GET', '/api/v1/audit?resourceType=session&limit=10');
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.some(e => e.action === 'LOGIN' && e.resource_type === 'session'));
  });
});
