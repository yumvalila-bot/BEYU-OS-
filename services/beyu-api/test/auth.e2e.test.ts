/**
 * Authentication end-to-end tests (spec §17, §55).
 *
 * Drives the real application over HTTP against a real (WASM) PostgreSQL.
 * These cover the properties an authentication bug would make catastrophic:
 * no user enumeration, no token forgery, rotation on refresh, immediate effect
 * of revocation, and a full audit record of both success and failure.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Role } from '@beyu/types';

import type { Database } from '../src/db/driver';

process.env.BEYU_ENV = 'testing';

let app: INestApplication;
let baseUrl: string;
let dataDir: string;
let db: Database;

const EMAIL = 'trustee@beyu.example';
const PASSWORD = 'a-sufficiently-long-password';

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed as any };
}

const post = (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b, h);
const get = (p: string, h?: Record<string, string>) => call('GET', p, undefined, h);

const login = (email = EMAIL, password = PASSWORD) => post('/api/v1/auth/login', { email, password });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'beyu-auth-'));
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DATABASE_DRIVER = 'pglite';

  const { resetConfigCache } = await import('@beyu/config');
  resetConfigCache();

  const { closeDatabase, getDatabase } = await import('../src/db/driver');
  await closeDatabase();
  db = getDatabase();

  const { migrate } = await import('../src/db/migrator');
  await migrate(db);
  const { seed } = await import('../src/db/seed');
  await seed(db);

  // Create a user directly, the way `create-admin` does.
  const { hashPassword } = await import('@beyu/security');
  const user = await db.query<{ id: string }>(
    `INSERT INTO identity.users (identity_id, email, display_name, password_hash, status, max_classification)
     VALUES (gen_random_uuid(), $1, 'Test Trustee', $2, 'ACTIVE', 'RESTRICTED')
     RETURNING id`,
    [EMAIL, hashPassword(PASSWORD)],
  );
  const role = await db.query<{ id: string }>(
    'SELECT id FROM identity.roles WHERE code = $1',
    [Role.TrustAdministrator],
  );
  await db.query('INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2)', [
    user.rows[0].id,
    role.rows[0].id,
  ]);

  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});

after(async () => {
  await app?.close();
  const { closeDatabase } = await import('../src/db/driver');
  await closeDatabase();
  await rm(dataDir, { recursive: true, force: true });
});

describe('seeded roles match the contract', () => {
  it('stores canonical role codes, not TypeScript enum keys', async () => {
    const result = await db.query<{ code: string }>('SELECT code FROM identity.roles');
    const stored = result.rows.map((r) => r.code).sort();
    const canonical = Object.values(Role).sort();
    assert.deepEqual(
      stored,
      canonical,
      'Seeded role codes must equal the Role enum values exactly. A mismatch makes every ' +
        'role lookup silently match nothing.',
    );
  });
});

describe('login', () => {
  it('issues a token pair for correct credentials', async () => {
    const res = await login();
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.ok(res.body.refreshToken);
    assert.equal(res.body.tokenType, 'Bearer');
    assert.deepEqual(res.body.user.roles, [Role.TrustAdministrator]);
  });

  it('never returns the password hash', async () => {
    const res = await login();
    assert.ok(!JSON.stringify(res.body).includes('scrypt'));
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it('rejects a wrong password', async () => {
    const res = await login(EMAIL, 'wrong-password-entirely');
    assert.equal(res.status, 401);
  });

  it('gives an identical response for unknown and wrong-password, preventing enumeration', async () => {
    const unknown = await login('nobody@beyu.example', PASSWORD);
    const wrong = await login(EMAIL, 'definitely-not-the-password');
    assert.equal(unknown.status, wrong.status);
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  it('rejects a malformed email before touching the database', async () => {
    const res = await post('/api/v1/auth/login', { email: 'not-an-email', password: PASSWORD });
    assert.equal(res.status, 400);
  });

  it('rejects unexpected properties in the body', async () => {
    const res = await post('/api/v1/auth/login', {
      email: EMAIL,
      password: PASSWORD,
      isAdmin: true, // attempted privilege injection
    });
    assert.equal(res.status, 400);
  });
});

describe('bearer tokens', () => {
  it('grants access to a protected route', async () => {
    const { body } = await login();
    const res = await get('/api/v1/audit', bearer(body.accessToken));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
  });

  it('describes the caller at /auth/me', async () => {
    const { body } = await login();
    const res = await get('/api/v1/auth/me', bearer(body.accessToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, EMAIL);
    assert.deepEqual(res.body.roles, [Role.TrustAdministrator]);
    assert.equal(res.body.permissions, undefined, 'internal permissions must not be exposed');
  });

  it('rejects a tampered token', async () => {
    const { body } = await login();
    const [header, payload, signature] = String(body.accessToken).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: 'other' }),
    ).toString('base64url');
    const res = await get('/api/v1/audit', bearer(`${header}.${forgedPayload}.${signature}`));
    assert.equal(res.status, 401);
  });

  it('rejects an alg:none token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'anyone', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const res = await get('/api/v1/audit', bearer(`${header}.${payload}.`));
    assert.equal(res.status, 401);
  });

  it('rejects a garbage token', async () => {
    assert.equal((await get('/api/v1/audit', bearer('not-a-token'))).status, 401);
  });

  it('still rejects when no token is presented', async () => {
    assert.equal((await get('/api/v1/audit')).status, 401);
  });
});

describe('refresh rotation', () => {
  it('exchanges a refresh token for a new pair', async () => {
    const { body } = await login();
    const res = await post('/api/v1/auth/refresh', { refreshToken: body.refreshToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.notEqual(res.body.refreshToken, body.refreshToken, 'the refresh token must rotate');
  });

  it('refuses to reuse a consumed refresh token', async () => {
    const { body } = await login();
    const first = await post('/api/v1/auth/refresh', { refreshToken: body.refreshToken });
    assert.equal(first.status, 200);

    const replay = await post('/api/v1/auth/refresh', { refreshToken: body.refreshToken });
    assert.equal(replay.status, 401, 'a replayed refresh token must be rejected');
  });

  it('rejects an unknown refresh token', async () => {
    const res = await post('/api/v1/auth/refresh', { refreshToken: 'z'.repeat(64) });
    assert.equal(res.status, 401);
  });
});

describe('logout', () => {
  it('revokes the refresh token', async () => {
    const { body } = await login();
    assert.equal((await post('/api/v1/auth/logout', { refreshToken: body.refreshToken })).status, 204);

    const after = await post('/api/v1/auth/refresh', { refreshToken: body.refreshToken });
    assert.equal(after.status, 401, 'a revoked refresh token must not be usable');
  });

  it('is idempotent', async () => {
    const { body } = await login();
    await post('/api/v1/auth/logout', { refreshToken: body.refreshToken });
    assert.equal((await post('/api/v1/auth/logout', { refreshToken: body.refreshToken })).status, 204);
  });
});

describe('account status is honoured immediately', () => {
  it('rejects a token once the account is suspended', async () => {
    const email = 'suspendable@beyu.example';
    const { hashPassword } = await import('@beyu/security');
    await db.query(
      `INSERT INTO identity.users (identity_id, email, display_name, password_hash, status)
       VALUES (gen_random_uuid(), $1, 'Suspendable', $2, 'ACTIVE')`,
      [email, hashPassword(PASSWORD)],
    );

    const { body } = await login(email, PASSWORD);
    assert.ok(body.accessToken);

    // Suspend after the token was issued. The token is still cryptographically
    // valid, so this only passes because the context is rebuilt per request.
    await db.query(`UPDATE identity.users SET status = 'SUSPENDED' WHERE lower(email) = lower($1)`, [
      email,
    ]);

    const res = await get('/api/v1/auth/me', bearer(body.accessToken));
    assert.equal(res.status, 401, 'suspension must take effect without waiting for token expiry');
  });
});

describe('authentication is audited', () => {
  it('records successful and failed sign-in attempts', async () => {
    const email = 'audited@beyu.example';
    const { hashPassword } = await import('@beyu/security');
    await db.query(
      `INSERT INTO identity.users (identity_id, email, display_name, password_hash, status)
       VALUES (gen_random_uuid(), $1, 'Audited', $2, 'ACTIVE')`,
      [email, hashPassword(PASSWORD)],
    );

    await login(email, PASSWORD);
    await login(email, 'wrong-password-here');

    const rows = await db.query<{ outcome: string }>(
      `SELECT a.outcome
         FROM audit.audit_log a
         JOIN identity.users u ON u.id = a.actor_user_id
        WHERE lower(u.email) = lower($1) AND a.action = 'LOGIN'`,
      [email],
    );
    const outcomes = rows.rows.map((r) => r.outcome);
    assert.ok(outcomes.includes('SUCCESS'), 'a successful login must be audited');
    assert.ok(outcomes.includes('DENIED'), 'a failed login must be audited');
  });

  it('leaves the audit chain intact after authentication activity', async () => {
    const { AuditRepository } = await import('../src/modules/audit/audit.repository');
    const verification = await new AuditRepository(db).verify();
    assert.equal(verification.valid, true, verification.reason ?? '');
  });
});
