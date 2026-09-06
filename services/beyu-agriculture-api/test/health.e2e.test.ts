/**
 * Health/readiness, tenant administration and reporting tests.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, TENANT_KE } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;

before(async () => { h = await boot('sys', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('health endpoints', () => {
  it('liveness is public', async () => {
    const res = await h.request('GET', '/api/v1/health/live');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).status, 'ok');
    assert.equal((res.body as any).service, 'beyu-agriculture-os');
  });
  it('readiness reports database state', async () => {
    const res = await h.request('GET', '/api/v1/health/ready');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).status, 'ok');
    assert.equal((res.body as any).database.ok, true);
  });
});

describe('tenant administration', () => {
  it('lists tenants', async () => {
    const res = await h.auth('GET', '/api/v1/tenants');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 2);
  });
  it('creates a tenant with validated slug', async () => {
    const res = await h.auth('POST', '/api/v1/tenants', { name: 'Test Cooperative', slug: 'test-coop-2026', type: 'COOPERATIVE', countryCode: 'TZ' });
    assert.equal(res.status, 201);
  });
  it('rejects malformed slugs', async () => {
    const res = await h.auth('POST', '/api/v1/tenants', { name: 'X', slug: 'NOT VALID!', type: 'COOPERATIVE', countryCode: 'TZ' });
    assert.equal(res.status, 400);
  });
  it('rejects duplicate slugs', async () => {
    const res = await h.auth('POST', '/api/v1/tenants', { name: 'X', slug: 'test-coop-2026', type: 'COOPERATIVE', countryCode: 'TZ' });
    assert.equal(res.status, 409);
  });
  it('rejects invalid type', async () => {
    const res = await h.auth('POST', '/api/v1/tenants', { name: 'X', slug: 'another-slug-1', type: 'SPACE_AGENCY', countryCode: 'TZ' });
    assert.equal(res.status, 400);
  });
  it('activates a tenant', async () => {
    const res = await h.auth('PUT', `/api/v1/tenants/${TENANT_KE}`, { status: 'ACTIVE' });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).after.status, 'ACTIVE');
  });
});

describe('reporting', () => {
  it('returns tenant stats', async () => {
    const res = await h.auth('GET', '/api/v1/reports/tenant-stats');
    assert.equal(res.status, 200);
    const stats = res.body as any;
    assert.ok(typeof stats.farms === 'number');
    assert.ok(typeof stats.fields === 'number');
    assert.ok(typeof stats.storageKg === 'number');
    assert.ok(typeof stats.harvestYtdKg === 'number');
    assert.ok(stats.generatedAt);
  });
  it('stats stay tenant-scoped', async () => {
    // Seed data: TZ has 2 farms, KE has 1 farm. As SUPER_ADMIN the call
    // aggregates the default tenant; as a TZ member it must see TZ only.
    await h.createUser('tz.user@beyu.agriculture', 'a-sufficiently-long-password', ['FARM_MANAGER'], TENANT_TZ, null);
    const token = await h.loginAs('tz.user@beyu.agriculture', 'a-sufficiently-long-password');
    const res = await h.auth('GET', '/api/v1/reports/tenant-stats', undefined, token);
    assert.equal(res.status, 200);
    assert.equal((res.body as any).tenantId, TENANT_TZ);
    assert.equal((res.body as any).farms, 2);
  });
});

describe('unknown routes', () => {
  it('404s cleanly', async () => {
    const res = await h.auth('GET', '/api/v1/does-not-exist');
    assert.equal(res.status, 404);
  });
});
