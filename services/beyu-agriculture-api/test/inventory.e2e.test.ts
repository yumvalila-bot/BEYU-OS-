/**
 * Inventory end-to-end tests: warehouses, input items, stock movements.
 * Core invariant: on-hand balance per (warehouse, item) never goes negative.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_KILOMBERO, WAREHOUSE_INPUT, INPUT_SEED, INPUT_FERT } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;

before(async () => { h = await boot('inv', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('warehouses', () => {
  it('lists seeded warehouses', async () => {
    const res = await h.auth('GET', '/api/v1/warehouses');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 3);
    const cold = (res.body as any).items.find((w: any) => w.code === 'WH-NJO-COLD');
    assert.equal(cold.is_cold_store, true);
  });
  it('creates a workshop warehouse', async () => {
    const res = await h.auth('POST', '/api/v1/warehouses', { farmId: FARM_KILOMBERO, code: 'WH-WORK-01', name: 'Kilombero Workshop', warehouseType: 'WORKSHOP' });
    assert.equal(res.status, 201);
  });
  it('rejects duplicate code in tenant', async () => {
    const res = await h.auth('POST', '/api/v1/warehouses', { tenantId: TENANT_TZ, code: 'WH-WORK-01', name: 'Dup', warehouseType: 'GENERAL' });
    assert.equal(res.status, 409);
  });
});

describe('input items', () => {
  it('lists seeded inputs', async () => {
    const res = await h.auth('GET', '/api/v1/input-items?category=FERTILIZER');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 2);
  });
  it('creates an input item', async () => {
    const res = await h.auth('POST', '/api/v1/input-items', { tenantId: TENANT_TZ, code: 'INP-SEED-MAIZE', name: 'H614 Certified Seed', category: 'SEED', unit: 'kg', manufacturer: 'TARI' });
    assert.equal(res.status, 201);
  });
  it('marks restricted inputs', async () => {
    const res = await h.auth('GET', '/api/v1/input-items?q=Glyphosate');
    assert.equal((res.body as any).items[0].is_restricted, true);
  });
  it('rejects duplicate code', async () => {
    const res = await h.auth('POST', '/api/v1/input-items', { tenantId: TENANT_TZ, code: 'INP-SEED-MAIZE', name: 'X', category: 'SEED', unit: 'kg' });
    assert.equal(res.status, 409);
  });
});

describe('stock movements and the no-negative-stock invariant', () => {
  it('purchases stock in', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_SEED, movementType: 'PURCHASE', quantity: 5000, unit: 'kg', occurredOn: '2026-01-05' });
    assert.equal(res.status, 201);
  });
  it('refuses issuance beyond balance', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_SEED, movementType: 'ISSUANCE_TO_ACTIVITY', quantity: 6000, unit: 'kg' });
    assert.equal(res.status, 400);
    assert.match(String((res.body as any).message), /insufficient/i);
  });
  it('allows partial issuance', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_SEED, movementType: 'ISSUANCE_TO_ACTIVITY', quantity: 3000, unit: 'kg', referenceType: 'field_activity', notes: 'Planting North Block A' });
    assert.equal(res.status, 201);
  });
  it('balances track exactly', async () => {
    const res = await h.auth('GET', `/api/v1/stock-summary?warehouseId=${WAREHOUSE_INPUT}`);
    assert.equal(res.status, 200);
    const seed = (res.body as any).items.find((i: any) => i.input_item_id === INPUT_SEED);
    assert.ok(seed);
    assert.equal(Number(seed.on_hand), 2000);
  });
  it('refuses return-driven negative? (returns only add)', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_SEED, movementType: 'RETURN', quantity: 100, unit: 'kg' });
    assert.equal(res.status, 201);
  });
  it('write-off cannot exceed balance', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_SEED, movementType: 'LOSS_WRITE_OFF', quantity: 99999, unit: 'kg' });
    assert.equal(res.status, 400);
  });
  it('rejects movement without an item or lot', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, movementType: 'ADJUSTMENT', quantity: 10, unit: 'kg' });
    assert.equal(res.status, 400);
  });
  it('rejects non-positive quantity', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: WAREHOUSE_INPUT, inputItemId: INPUT_FERT, movementType: 'PURCHASE', quantity: -5, unit: 'kg' });
    assert.equal(res.status, 400);
  });
  it('rejects unknown warehouse', async () => {
    const res = await h.auth('POST', '/api/v1/stock-movements', { warehouseId: '11111111-1111-1111-1111-111111111111', inputItemId: INPUT_FERT, movementType: 'PURCHASE', quantity: 5, unit: 'kg' });
    assert.equal(res.status, 404);
  });
  it('lists movements with joins', async () => {
    const res = await h.auth('GET', `/api/v1/stock-movements?warehouseId=${WAREHOUSE_INPUT}`);
    assert.equal(res.status, 200);
    // purchase + partial issuance + return = 3 successful movements here.
    assert.ok((res.body as any).total >= 3);
    const withName = (res.body as any).items.find((m: any) => m.input_item_name);
    assert.ok(withName, 'input item name joined');
  });
});
