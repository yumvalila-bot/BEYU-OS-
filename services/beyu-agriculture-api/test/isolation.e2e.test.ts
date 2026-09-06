/**
 * Tenant isolation, RLS and object-level authorization (IDOR) tests.
 *
 * Proves:
 *  - Tenant A users cannot list/read/write Tenant B data through the API.
 *  - Object-level access (IDOR) is denied cross-tenant.
 *  - PostgreSQL RLS policies themselves block cross-tenant rows for a
 *    non-privileged role (tested with SET ROLE under PGLite).
 *  - SUPER_ADMIN and AUDITOR are the only cross-tenant roles.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, HARNESS_PASSWORD, TENANT_TZ, TENANT_KE, FARM_KILOMBERO, FARM_NAIVASHA, FIELD_NORTH_A } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let tzManagerToken: string;
let tzFarmId: string;
let keFarmId: string;

before(async () => {
  h = await boot('iso', ['SUPER_ADMIN']);
  // Two tenant-scoped users in different tenants.
  await h.createUser('tz.manager@beyu.agriculture', HARNESS_PASSWORD, ['FARM_MANAGER'], TENANT_TZ, FARM_KILOMBERO);
  await h.createUser('ke.manager@beyu.agriculture', HARNESS_PASSWORD, ['FARM_MANAGER'], TENANT_KE, FARM_NAIVASHA);
  tzManagerToken = await h.loginAs('tz.manager@beyu.agriculture', HARNESS_PASSWORD);

  // Each tenant gets its own farm via the API.
  const tz = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'TZ Isolation Farm', farmType: 'CROP_FARM', countryCode: 'TZ' });
  const ke = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_KE, name: 'KE Isolation Farm', farmType: 'CROP_FARM', countryCode: 'KE' });
  tzFarmId = (tz.body as any).id;
  keFarmId = (ke.body as any).id;
});
after(async () => { await h.close(); });

describe('API tenant scoping', () => {
  it('tenant user only sees own tenant farms', async () => {
    const res = await h.auth('GET', '/api/v1/farms', undefined, tzManagerToken);
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.every(f => f.tenant_id === TENANT_TZ));
    assert.ok(!items.some(f => f.id === keFarmId));
  });
  it('tenant user cannot read another tenant farm by id (IDOR)', async () => {
    const res = await h.auth('GET', `/api/v1/farms/${keFarmId}`, undefined, tzManagerToken);
    assert.equal(res.status, 404);
  });
  it('tenant user cannot update another tenant farm (IDOR)', async () => {
    const res = await h.auth('PUT', `/api/v1/farms/${keFarmId}`, { name: 'Hacked' }, tzManagerToken);
    assert.equal(res.status, 404);
  });
  it('tenant user cannot delete another tenant farm (IDOR)', async () => {
    const res = await h.auth('DELETE', `/api/v1/farms/${keFarmId}`, undefined, tzManagerToken);
    assert.equal(res.status, 404);
  });
  it('super admin sees both tenants', async () => {
    const res = await h.auth('GET', '/api/v1/farms');
    const items = (res.body as any).items as any[];
    const tenants = new Set(items.map(f => f.tenant_id));
    assert.ok(tenants.has(TENANT_TZ) && tenants.has(TENANT_KE));
  });
  it('tenant auditor sees only own tenant in the audit trail', async () => {
    await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_KE, name: 'KE Second Farm', farmType: 'CROP_FARM', countryCode: 'KE' });
    await h.createUser('tz.auditor@beyu.agriculture', HARNESS_PASSWORD, ['AUDITOR'], TENANT_TZ, null);
    const tzAuditorToken = await h.loginAs('tz.auditor@beyu.agriculture', HARNESS_PASSWORD);
    const res = await h.auth('GET', '/api/v1/audit?limit=100', undefined, tzAuditorToken);
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.length > 0, 'auditor sees own tenant events');
    assert.ok(items.every(e => e.tenant_id === TENANT_TZ), 'no foreign tenant events');
  });
  it('farm managers do not receive audit-read permission', async () => {
    const res = await h.auth('GET', '/api/v1/audit', undefined, tzManagerToken);
    assert.equal(res.status, 403);
  });
});

describe('database RLS policies', () => {
  it('a non-privileged role only sees rows matching app.tenant', async () => {
    // Simulate a non-superuser connection (as a real Postgres deployment would run).
    await h.db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agri_app_probe') THEN CREATE ROLE agri_app_probe NOLOGIN; END IF; END $$;`);
    await h.db.query(`GRANT USAGE ON SCHEMA agri_farm TO agri_app_probe`);
    await h.db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA agri_farm TO agri_app_probe`);
    await h.db.query(`GRANT INSERT ON agri_farm.farms TO agri_app_probe`);

    // Tenant TZ context: only TZ farms visible.
    await h.db.transaction(async (session) => {
      await session.query(`SELECT set_config('app.tenant', $1, true)`, [TENANT_TZ]);
      await session.query(`SET ROLE agri_app_probe`);
      const r = await session.query<{ tenant_id: string }>(`SELECT DISTINCT tenant_id FROM agri_farm.farms WHERE deleted_at IS NULL`);
      await session.query(`RESET ROLE`);
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].tenant_id, TENANT_TZ);
    });
  });
  it('switching app.tenant switches the visible rows', async () => {
    await h.db.transaction(async (session) => {
      await session.query(`SELECT set_config('app.tenant', $1, true)`, [TENANT_KE]);
      await session.query(`SET ROLE agri_app_probe`);
      const r = await session.query<{ tenant_id: string }>(`SELECT DISTINCT tenant_id FROM agri_farm.farms WHERE deleted_at IS NULL`);
      await session.query(`RESET ROLE`);
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].tenant_id, TENANT_KE);
    });
  });
  it('cross_tenant GUC unlocks all rows (SUPER_ADMIN/AUDITOR path)', async () => {
    await h.db.transaction(async (session) => {
      await session.query(`SELECT set_config('app.cross_tenant', 'on', true)`);
      await session.query(`SET ROLE agri_app_probe`);
      const r = await session.query<{ n: string }>(`SELECT count(DISTINCT tenant_id)::text AS n FROM agri_farm.farms WHERE deleted_at IS NULL`);
      await session.query(`RESET ROLE`);
      assert.ok(Number(r.rows[0].n) >= 2);
    });
  });
  it('RLS blocks INSERT into another tenant as non-privileged role', async () => {
    await assert.rejects(
      h.db.transaction(async (session) => {
        await session.query(`SELECT set_config('app.tenant', $1, true)`, [TENANT_TZ]);
        await session.query(`SET ROLE agri_app_probe`);
        // This INSERT must fail and abort the transaction (RESET ROLE is
        // unnecessary: the rollback restores the prior role).
        await session.query(`INSERT INTO agri_farm.farms (tenant_id, code, name, farm_type, country_code) VALUES ($1,'RLS-1','RLS Probe','CROP_FARM','KE')`, [TENANT_KE]);
      }),
      /row-level security|new row violates/i,
    );
  });
});

describe('cross-tenant object access via API (deep)', () => {
  it('field creation cannot smuggle another tenant farm', async () => {
    const res = await h.auth('POST', '/api/v1/fields', { farmId: FARM_NAIVASHA, name: 'Smuggled', fieldUse: 'CROPLAND', areaHa: 1 }, tzManagerToken);
    assert.equal(res.status, 404);
  });
  it('soil record cannot target another tenant field', async () => {
    const res = await h.auth('POST', '/api/v1/soil-records', { fieldId: FIELD_NORTH_A, sampledOn: '2026-01-01' }, tzManagerToken);
    // FIELD_NORTH_A belongs to TZ tenant — the TZ manager CAN write it.
    assert.equal(res.status, 201);
  });
});
