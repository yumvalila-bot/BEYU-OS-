/**
 * Full crop production flow: crop catalogue → crop cycle → activities →
 * harvest → storage lot → release → traceability. Includes invariants:
 * one live cycle per field/season, yield computation, moisture/cold-store
 * gating, lot release accounting.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FIELD_NORTH_A, FIELD_NORTH_B, CROP_RICE, WAREHOUSE_PRODUCE, WAREHOUSE_COLD } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let cropId: string, cycleId: string, harvestId: string, lotId: string, lotCode: string;

before(async () => { h = await boot('prod', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('crop catalogue', () => {
  it('lists seeded crops', async () => {
    const res = await h.auth('GET', '/api/v1/crops');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 4);
  });
  it('creates a crop', async () => {
    const res = await h.auth('POST', '/api/v1/crops', { tenantId: TENANT_TZ, code: 'CRP-SUN-TEST', name: 'Sunflower (Record)', category: 'OILSEED', growingDaysMin: 95, growingDaysMax: 120 });
    assert.equal(res.status, 201);
    cropId = (res.body as any).id;
  });
  it('rejects duplicate code in tenant', async () => {
    const res = await h.auth('POST', '/api/v1/crops', { tenantId: TENANT_TZ, code: 'CRP-SUN-TEST', name: 'Sunflower Again', category: 'OILSEED' });
    assert.equal(res.status, 409);
  });
  it('rejects inverted growing days', async () => {
    const res = await h.auth('POST', '/api/v1/crops', { tenantId: TENANT_TZ, code: 'CRP-X', name: 'X Crop', category: 'CEREAL', growingDaysMin: 200, growingDaysMax: 100 });
    assert.equal(res.status, 400);
  });
});

describe('crop cycles', () => {
  it('creates a planted cycle', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-MASIKO', plantedOn: '2026-01-15', areaPlantedHa: 300, targetYieldTonsPerHa: 6.5 });
    assert.equal(res.status, 201);
    cycleId = (res.body as any).id;
    assert.equal((res.body as any).status, 'PLANTED');
  });
  it('rejects a second live cycle on the same field/season', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-MASIKO', plantedOn: '2026-02-01' });
    assert.ok([400, 409].includes(res.status), `status=${res.status}`);
  });
  it('allows the same season on a different field', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_B, cropId: CROP_RICE, seasonCode: '2026-MASIKO' });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).status, 'PLANNED');
  });
  it('rejects area planted above field area', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-MVUA', areaPlantedHa: 99999 });
    assert.equal(res.status, 400);
  });
  it('rejects a crop from another tenant', async () => {
    const res = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: '00000000-0000-0000-0000-000000000203', seasonCode: '2026-X' });
    assert.equal(res.status, 400);
  });
  it('lists cycles with joins', async () => {
    const res = await h.auth('GET', `/api/v1/crop-cycles?fieldId=${FIELD_NORTH_A}`);
    assert.equal(res.status, 200);
    const item = (res.body as any).items.find((c: any) => c.id === cycleId);
    assert.ok(item);
    assert.equal(item.crop_name, 'Rice (Saro 5)');
  });
});

describe('field activities', () => {
  it('creates a scheduled activity', async () => {
    const res = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, cropCycleId: cycleId, activityType: 'FERTILIZATION', scheduledOn: '2026-02-20', costAmount: 4500, costCurrency: 'TZS' });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).status, 'SCHEDULED');
    assert.equal((res.body as any).financeStatus ?? (res.body as any).finance_status, 'PENDING_INTEGRATION');
  });
  it('creates a completed activity', async () => {
    const res = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, cropCycleId: cycleId, activityType: 'IRRIGATION', performedOn: '2026-03-01' });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).status, 'COMPLETED');
  });
  it('completes a scheduled activity', async () => {
    const created = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, cropCycleId: cycleId, activityType: 'PEST_CONTROL', scheduledOn: '2026-03-15' });
    const id = (created.body as any).id;
    const done = await h.auth('POST', `/api/v1/activities/${id}/complete`, { performedOn: '2026-03-16', costAmount: 1200, costCurrency: 'TZS' });
    assert.equal(done.status, 200);
    assert.equal((done.body as any).after.status, 'COMPLETED');
  });
  it('rejects activity with cycle from a different field', async () => {
    const otherCycle = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_B, cropId: CROP_RICE, seasonCode: '2027-A' });
    const res = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, cropCycleId: (otherCycle.body as any).id, activityType: 'SCOUTING' });
    assert.equal(res.status, 400);
  });
  it('rejects negative cost', async () => {
    const res = await h.auth('POST', '/api/v1/activities', { fieldId: FIELD_NORTH_A, activityType: 'WEEDING', costAmount: -10 });
    assert.equal(res.status, 400);
  });
});

describe('harvest and yield', () => {
  it('records a harvest and computes cycle status/yield', async () => {
    const res = await h.auth('POST', '/api/v1/harvests', { cropCycleId: cycleId, harvestedOn: '2026-05-20', quantityKg: 180000, moisturePct: 13, qualityGrade: 'A' });
    assert.equal(res.status, 201);
    harvestId = (res.body as any).id;
    const cycle = await h.auth('GET', `/api/v1/crop-cycles/${cycleId}`);
    // Cycle stays open for split harvests; yield is already computed.
    assert.equal((cycle.body as any).status, 'PLANTED');
    // 180,000 kg over 300 ha = 0.6 t/ha
    assert.equal(Number((cycle.body as any).actual_yield_tons_per_ha), 0.6);
  });
  it('accumulates yield across multiple harvests', async () => {
    const res = await h.auth('POST', '/api/v1/harvests', { cropCycleId: cycleId, harvestedOn: '2026-05-25', quantityKg: 120000, qualityGrade: 'B' });
    assert.equal(res.status, 201);
    const cycle = await h.auth('GET', `/api/v1/crop-cycles/${cycleId}`);
    assert.equal(Number((cycle.body as any).actual_yield_tons_per_ha), 1.0);
  });
  it('rejects harvesting an explicitly closed cycle', async () => {
    // Close the cycle explicitly (requires harvestedOn).
    await h.auth('PUT', `/api/v1/crop-cycles/${cycleId}`, { status: 'HARVESTED', harvestedOn: '2026-05-26' });
    const res = await h.auth('POST', '/api/v1/harvests', { cropCycleId: cycleId, harvestedOn: '2026-06-01', quantityKg: 1 });
    assert.equal(res.status, 409);
  });
  it('rejects non-positive quantity', async () => {
    const planned = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_B, cropId: CROP_RICE, seasonCode: '2027-B' });
    const res = await h.auth('POST', '/api/v1/harvests', { cropCycleId: (planned.body as any).id, harvestedOn: '2026-06-01', quantityKg: 0 });
    assert.equal(res.status, 400);
  });
});

describe('storage lots', () => {
  it('creates a lot from the harvest', async () => {
    const res = await h.auth('POST', '/api/v1/storage-lots', { harvestId, warehouseId: WAREHOUSE_PRODUCE, quantityKg: 250000 });
    assert.equal(res.status, 201);
    lotId = (res.body as any).id;
    lotCode = (res.body as any).lot_code ?? (res.body as any).lotCode;
    assert.match(lotCode, /^LOT-\d{2}-\d{5}$/);
  });
  it('gates high-moisture harvests into cold stores', async () => {
    const wetCycle = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_B, cropId: CROP_RICE, seasonCode: '2027-C' });
    const wetHarvest = await h.auth('POST', '/api/v1/harvests', { cropCycleId: (wetCycle.body as any).id, harvestedOn: '2026-06-10', quantityKg: 1000, moisturePct: 18 });
    const res = await h.auth('POST', '/api/v1/storage-lots', { harvestId: (wetHarvest.body as any).id, warehouseId: WAREHOUSE_PRODUCE, quantityKg: 900 });
    assert.equal(res.status, 400);
    const ok = await h.auth('POST', '/api/v1/storage-lots', { harvestId: (wetHarvest.body as any).id, warehouseId: WAREHOUSE_COLD, quantityKg: 900 });
    assert.equal(ok.status, 201);
  });
  it('releases exactly the remaining quantity', async () => {
    const part = await h.auth('POST', `/api/v1/storage-lots/${lotId}/release`, { quantityKg: 100000 });
    assert.equal(part.status, 200);
    assert.equal(Number((part.body as any).after.quantity_released_kg), 100000);
    assert.equal((part.body as any).after.status, 'IN_STORAGE');
    const all = await h.auth('POST', `/api/v1/storage-lots/${lotId}/release`, { quantityKg: 150000 });
    assert.equal(all.status, 200);
    assert.equal((all.body as any).after.status, 'RELEASED');
  });
  it('refuses to release more than remains', async () => {
    const res = await h.auth('POST', `/api/v1/storage-lots/${lotId}/release`, { quantityKg: 1 });
    assert.equal(res.status, 400);
  });
});

describe('traceability', () => {
  it('traces a lot back to field and farm', async () => {
    const res = await h.auth('GET', `/api/v1/traceability/lots/${lotId}`);
    assert.equal(res.status, 200);
    const report = res.body as any;
    assert.equal(report.storageLot.id, lotId);
    assert.ok(report.harvest, 'harvest present');
    assert.ok(report.cropCycle, 'cycle present');
    assert.ok(report.field, 'field present');
    assert.equal(report.farm.name, 'Kilombero Rice Estate');
    assert.ok(report.activities.length >= 3, 'activities chained');
  });
  it('404s on unknown lot', async () => {
    const res = await h.auth('GET', '/api/v1/traceability/lots/11111111-1111-1111-1111-111111111111');
    assert.equal(res.status, 404);
  });
});
