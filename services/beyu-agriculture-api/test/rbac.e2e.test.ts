/**
 * RBAC end-to-end tests: verifies the permission matrix is enforced at the
 * API layer for each canonical role — including least privilege for
 * FARM_WORKER and read-only AUDITOR.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, HARNESS_PASSWORD, TENANT_TZ, FARM_KILOMBERO, FIELD_NORTH_A, CROP_RICE } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let workerToken: string, auditorToken: string, agronomistToken: string, livestockToken: string, procurementToken: string;

before(async () => {
  h = await boot('rbac', ['SUPER_ADMIN']);
  await h.createUser('worker@beyu.agriculture', HARNESS_PASSWORD, ['FARM_WORKER'], TENANT_TZ, FARM_KILOMBERO);
  await h.createUser('auditor@beyu.agriculture', HARNESS_PASSWORD, ['AUDITOR'], TENANT_TZ, null);
  await h.createUser('agronomist@beyu.agriculture', HARNESS_PASSWORD, ['AGRONOMIST'], TENANT_TZ, null);
  await h.createUser('livestockmgr@beyu.agriculture', HARNESS_PASSWORD, ['LIVESTOCK_MANAGER'], TENANT_TZ, null);
  await h.createUser('procurement@beyu.agriculture', HARNESS_PASSWORD, ['PROCUREMENT_OFFICER'], TENANT_TZ, null);
  workerToken = await h.loginAs('worker@beyu.agriculture', HARNESS_PASSWORD);
  auditorToken = await h.loginAs('auditor@beyu.agriculture', HARNESS_PASSWORD);
  agronomistToken = await h.loginAs('agronomist@beyu.agriculture', HARNESS_PASSWORD);
  livestockToken = await h.loginAs('livestockmgr@beyu.agriculture', HARNESS_PASSWORD);
  procurementToken = await h.loginAs('procurement@beyu.agriculture', HARNESS_PASSWORD);
});
after(async () => { await h.close(); });

describe('FARM_WORKER least privilege', () => {
  it('can read farms', async () => {
    assert.equal((await h.auth('GET', '/api/v1/farms', undefined, workerToken)).status, 200);
  });
  it('cannot create farms', async () => {
    assert.equal((await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'X', farmType: 'CROP_FARM', countryCode: 'TZ' }, workerToken)).status, 403);
  });
  it('cannot delete fields', async () => {
    assert.equal((await h.auth('DELETE', `/api/v1/fields/${FIELD_NORTH_A}`, undefined, workerToken)).status, 403);
  });
  it('cannot read users', async () => {
    assert.equal((await h.auth('GET', '/api/v1/users', undefined, workerToken)).status, 403);
  });
  it('cannot manage warehouses', async () => {
    assert.equal((await h.auth('POST', '/api/v1/warehouses', { code: 'WH-W', name: 'W', warehouseType: 'GENERAL' }, workerToken)).status, 403);
  });
  it('can record field activities', async () => {
    const res = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, activityType: 'SCOUTING', performedOn: '2026-04-01' }, workerToken);
    assert.equal(res.status, 201);
  });
});

describe('AUDITOR read-only', () => {
  it('can read farms', async () => {
    assert.equal((await h.auth('GET', '/api/v1/farms', undefined, auditorToken)).status, 200);
  });
  it('can read audit trail', async () => {
    assert.equal((await h.auth('GET', '/api/v1/audit', undefined, auditorToken)).status, 200);
  });
  it('cannot write anything', async () => {
    assert.equal((await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'X', farmType: 'CROP_FARM', countryCode: 'TZ' }, auditorToken)).status, 403);
    assert.equal((await h.auth('POST', '/api/v1/crops', { tenantId: TENANT_TZ, code: 'X', name: 'X', category: 'CEREAL' }, auditorToken)).status, 403);
  });
});

describe('AGRONOMIST crop scope', () => {
  it('can create crop cycles', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-AGRO' }, agronomistToken);
    assert.equal(res.status, 201);
  });
  it('cannot manage livestock', async () => {
    assert.equal((await h.auth('POST', '/api/v1/animals', { tagNumber: 'RBAC-ANIMAL-1', species: 'GOAT', sex: 'FEMALE' }, agronomistToken)).status, 403);
  });
  it('cannot create equipment', async () => {
    assert.equal((await h.auth('POST', '/api/v1/equipment', { code: 'EQ-RBAC', name: 'X', equipmentType: 'TRACTOR' }, agronomistToken)).status, 403);
  });
});

describe('LIVESTOCK_MANAGER livestock scope', () => {
  it('can create herds and animals', async () => {
    const herd = await h.auth('POST', '/api/v1/herds', { farmId: FARM_KILOMBERO, name: 'RBAC Herd', species: 'GOAT', code: 'HRD-RBAC-1' }, livestockToken);
    assert.equal(herd.status, 201);
    const animal = await h.auth('POST', '/api/v1/animals', { herdId: (herd.body as any).id, tagNumber: 'RBAC-GOAT-1', species: 'GOAT', sex: 'FEMALE' }, livestockToken);
    assert.equal(animal.status, 201);
  });
  it('cannot create crop cycles', async () => {
    assert.equal((await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-LS' }, livestockToken)).status, 403);
  });
});

describe('PROCUREMENT_OFFICER scope', () => {
  it('can create purchase orders', async () => {
    const res = await h.auth('POST', '/api/v1/purchase-orders', { supplierId: '00000000-0000-0000-0000-000000000600', orderDate: '2026-03-01', currency: 'TZS', lines: [{ description: 'Seed', quantity: 10, unit: 'kg', unitPrice: 100 }] }, procurementToken);
    assert.equal(res.status, 201);
  });
  it('cannot touch farms or livestock', async () => {
    assert.equal((await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'X', farmType: 'CROP_FARM', countryCode: 'TZ' }, procurementToken)).status, 403);
    assert.equal((await h.auth('POST', '/api/v1/animals', { tagNumber: 'RBAC-P-1', species: 'CATTLE', sex: 'MALE' }, procurementToken)).status, 403);
  });
});

describe('users administration', () => {
  it('SUPER_ADMIN can create users', async () => {
    const res = await h.auth('POST', '/api/v1/users', { email: 'created@beyu.agriculture', displayName: 'Created User', password: 'a-very-long-password', roles: ['FARM_WORKER'], tenantId: TENANT_TZ });
    assert.equal(res.status, 201);
  });
  it('non-admin cannot create users', async () => {
    const res = await h.auth('POST', '/api/v1/users', { email: 'hack@beyu.agriculture', displayName: 'H', password: 'a-very-long-password', roles: ['SUPER_ADMIN'] }, workerToken);
    assert.equal(res.status, 403);
  });
  it('privilege escalation via self-created roles is impossible (no endpoint)', async () => {
    const res = await h.auth('PUT', '/api/v1/users/me', { roles: ['SUPER_ADMIN'] }, workerToken);
    assert.ok([403, 404].includes(res.status));
  });
});
