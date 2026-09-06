/**
 * Operations end-to-end tests: equipment, maintenance, fuel, workers,
 * work orders.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_KILOMBERO, FIELD_NORTH_A } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let equipmentId: string, workerId: string, workOrderId: string;

before(async () => { h = await boot('ops', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('equipment', () => {
  it('creates a tractor', async () => {
    const res = await h.auth('POST', '/api/v1/equipment', { farmId: FARM_KILOMBERO, code: 'EQ-TR-001', name: 'John Deere 5075E', equipmentType: 'TRACTOR', purchaseDate: '2024-08-15', purchaseCost: 45000000, currency: 'TZS' });
    assert.equal(res.status, 201);
    equipmentId = (res.body as any).id;
    assert.equal(Number((res.body as any).operating_hours), 0);
  });
  it('rejects duplicate code', async () => {
    const res = await h.auth('POST', '/api/v1/equipment', { farmId: FARM_KILOMBERO, code: 'EQ-TR-001', name: 'Dup', equipmentType: 'TRACTOR' });
    assert.equal(res.status, 409);
  });
  it('rejects invalid equipment type', async () => {
    const res = await h.auth('POST', '/api/v1/equipment', { code: 'EQ-X', name: 'X', equipmentType: 'SUBMARINE' });
    assert.equal(res.status, 400);
  });
  it('marks equipment broken down', async () => {
    const res = await h.auth('PUT', `/api/v1/equipment/${equipmentId}`, { status: 'BROKEN_DOWN' });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).after.status, 'BROKEN_DOWN');
  });
});

describe('maintenance', () => {
  it('logs a repair that returns equipment to operational', async () => {
    const res = await h.auth('POST', '/api/v1/maintenance-logs', { equipmentId, maintenanceType: 'REPAIR', performedOn: '2026-03-10', performedBy: 'Kilombero Workshop', costAmount: 850000, costCurrency: 'TZS', hoursAtService: 1200, notes: 'Hydraulic hose replacement' });
    assert.equal(res.status, 201);
    const eq = await h.auth('GET', `/api/v1/equipment?status=OPERATIONAL`);
    assert.ok((eq.body as any).items.some((e: any) => e.id === equipmentId));
    const detail = (eq.body as any).items.find((e: any) => e.id === equipmentId);
    assert.equal(Number(detail.operating_hours), 1200);
  });
  it('logs routine service', async () => {
    const res = await h.auth('POST', '/api/v1/maintenance-logs', { equipmentId, maintenanceType: 'SERVICE', performedOn: '2026-06-10', hoursAtService: 1350 });
    assert.equal(res.status, 201);
  });
  it('lists maintenance logs', async () => {
    const res = await h.auth('GET', `/api/v1/maintenance-logs?equipmentId=${equipmentId}`);
    assert.equal((res.body as any).total, 2);
  });
});

describe('fuel', () => {
  it('logs fuel with hour meter', async () => {
    const res = await h.auth('POST', '/api/v1/fuel-logs', { equipmentId, fueledOn: '2026-06-12', fuelLitres: 95.5, hoursAtFueling: 1380, costAmount: 268400, costCurrency: 'TZS' });
    assert.equal(res.status, 201);
  });
  it('rejects zero litres', async () => {
    const res = await h.auth('POST', '/api/v1/fuel-logs', { equipmentId, fueledOn: '2026-06-13', fuelLitres: 0 });
    assert.equal(res.status, 400);
  });
  it('lists fuel logs', async () => {
    const res = await h.auth('GET', `/api/v1/fuel-logs?equipmentId=${equipmentId}`);
    assert.equal((res.body as any).total, 1);
  });
});

describe('workers', () => {
  it('creates a worker with generated code', async () => {
    const res = await h.auth('POST', '/api/v1/workers', { farmId: FARM_KILOMBERO, fullName: 'Juma Ally', phone: '+255 715 000 111', role: 'Machine Operator' });
    assert.equal(res.status, 201);
    workerId = (res.body as any).id;
    assert.match((res.body as any).worker_code, /^WRK-\d{4}$/);
  });
  it('rejects missing name', async () => {
    const res = await h.auth('POST', '/api/v1/workers', { fullName: '' });
    assert.equal(res.status, 400);
  });
  it('lists workers', async () => {
    const res = await h.auth('GET', `/api/v1/workers?farmId=${FARM_KILOMBERO}`);
    assert.ok((res.body as any).total >= 1);
  });
});

describe('work orders', () => {
  it('creates and assigns a work order', async () => {
    const res = await h.auth('POST', '/api/v1/work-orders', { farmId: FARM_KILOMBERO, fieldId: FIELD_NORTH_A, title: 'Top-dress North Block A', priority: 'HIGH', assignedToWorkerId: workerId, scheduledFor: '2026-07-01' });
    assert.equal(res.status, 201);
    workOrderId = (res.body as any).id;
    assert.match((res.body as any).work_order_number, /^WO-\d{2}-\d{5}$/);
    assert.equal((res.body as any).status, 'ASSIGNED');
  });
  it('walks ASSIGNED→IN_PROGRESS→COMPLETED', async () => {
    assert.equal((await h.auth('POST', `/api/v1/work-orders/${workOrderId}/transition`, { status: 'IN_PROGRESS' })).status, 200);
    const done = await h.auth('POST', `/api/v1/work-orders/${workOrderId}/transition`, { status: 'COMPLETED' });
    assert.equal(done.status, 200);
    assert.ok((done.body as any).after.completed_on);
  });
  it('rejects illegal transition from COMPLETED', async () => {
    const res = await h.auth('POST', `/api/v1/work-orders/${workOrderId}/transition`, { status: 'IN_PROGRESS' });
    assert.equal(res.status, 409);
  });
  it('rejects assignment of another tenant worker', async () => {
    const res = await h.auth('POST', '/api/v1/work-orders', { farmId: FARM_KILOMBERO, title: 'Bad assign', assignedToWorkerId: '11111111-1111-1111-1111-111111111111' });
    assert.equal(res.status, 404);
  });
  it('lists work orders with assignee join', async () => {
    const res = await h.auth('GET', `/api/v1/work-orders?farmId=${FARM_KILOMBERO}`);
    const wo = (res.body as any).items.find((w: any) => w.id === workOrderId);
    assert.ok(wo);
    assert.equal(wo.assigned_to_name, 'Juma Ally');
  });
});
