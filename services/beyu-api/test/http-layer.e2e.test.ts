/**
 * HTTP layer end-to-end tests (spec §50, §51, §55).
 *
 * Boots the real Nest application against a real (WASM) PostgreSQL and drives
 * it over HTTP. The properties under test are the ones a mistake would make
 * catastrophic: an unannotated endpoint must not be reachable, unauthenticated
 * requests must be rejected, and errors must not leak internals.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

process.env.BEYU_ENV = 'testing';

let app: INestApplication;
let baseUrl: string;
let dataDir: string;

async function get(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body: body as any, headers: response.headers };
}

/** An endpoint that forgets to declare a permission. Must be denied. */
@Controller('unannotated')
class UnannotatedController {
  @Get()
  handle(): { secret: string } {
    return { secret: 'this must never be returned' };
  }
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'beyu-http-'));
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DATABASE_DRIVER = 'pglite';

  const { resetConfigCache } = await import('@beyu/config');
  resetConfigCache();

  const { closeDatabase, getDatabase } = await import('../src/db/driver');
  await closeDatabase();
  const { migrate } = await import('../src/db/migrator');
  await migrate(getDatabase());

  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [UnannotatedController],
  }).compile();

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

describe('health endpoints are public', () => {
  it('serves liveness without credentials', async () => {
    const res = await get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.contractsVersion, '1.0.0');
  });

  it('reports readiness once the database is reachable', async () => {
    const res = await get('/api/v1/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'up');
  });
});

describe('authorization is mandatory', () => {
  it('rejects unauthenticated access to the audit trail', async () => {
    const res = await get('/api/v1/audit');
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Authentication is required/);
  });

  it('rejects unauthenticated access to audit verification', async () => {
    assert.equal((await get('/api/v1/audit/verify')).status, 401);
  });

  it('never leaks the payload of a protected endpoint in the denial', async () => {
    const res = await get('/api/v1/audit');
    assert.ok(!JSON.stringify(res.body).includes('entry_hash'));
  });
});

describe('endpoints fail closed', () => {
  it('denies a handler that declares no required permission', async () => {
    // The endpoint exists and would happily return data, but the global guard
    // refuses to serve it because it never declared what it requires.
    const res = await get('/api/v1/unannotated');
    assert.notEqual(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes('this must never be returned'));
  });
});

describe('request correlation', () => {
  it('returns a request id on every response', async () => {
    const res = await get('/api/v1/health');
    assert.match(res.headers.get('x-request-id') ?? '', /[\w-]{8,}/);
  });

  it('echoes a well-formed caller-supplied request id', async () => {
    const res = await get('/api/v1/health', { 'x-request-id': 'trace-abc-123' });
    assert.equal(res.headers.get('x-request-id'), 'trace-abc-123');
  });

  it('replaces a malformed request id rather than reflecting it', async () => {
    const injected = '<script>alert(1)</script>';
    const res = await get('/api/v1/health', { 'x-request-id': injected });
    assert.notEqual(res.headers.get('x-request-id'), injected);
  });

  it('includes the request id in error bodies', async () => {
    const res = await get('/api/v1/audit');
    assert.ok(res.body.error.requestId);
    assert.equal(res.body.error.requestId, res.headers.get('x-request-id'));
  });
});

describe('error shape', () => {
  it('returns a uniform envelope for 404s', async () => {
    const res = await get('/api/v1/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.status, 404);
    assert.ok(res.body.error.timestamp);
  });
});
