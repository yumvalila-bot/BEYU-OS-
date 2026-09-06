/**
 * Procurement end-to-end tests: suppliers, buyers, purchase orders, sales
 * orders (with lot release) and trade contracts. Verifies lifecycle state
 * machines and the Finance OS boundary fields.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_KILOMBERO, FIELD_NORTH_A, CROP_RICE, WAREHOUSE_PRODUCE, SUPPLIER_TFC, BUYER_KARIBU } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let poId: string, soId: string, lotId: string, contractId: string;

before(async () => {
  h = await boot('proc', ['SUPER_ADMIN']);
  // Produce a lot to sell: cycle → harvest → lot.
  const cycle = await h.auth('POST', '/api/v1/crop-cycles', { fieldId: FIELD_NORTH_A, cropId: CROP_RICE, seasonCode: '2026-PROC', plantedOn: '2026-01-10', areaPlantedHa: 100 });
  const harvest = await h.auth('POST', '/api/v1/harvests', { cropCycleId: (cycle.body as any).id, harvestedOn: '2026-05-30', quantityKg: 50000, moisturePct: 12 });
  const lot = await h.auth('POST', '/api/v1/storage-lots', { harvestId: (harvest.body as any).id, warehouseId: WAREHOUSE_PRODUCE, quantityKg: 48000 });
  lotId = (lot.body as any).id;
});
after(async () => { await h.close(); });

describe('counterparties', () => {
  it('lists seeded suppliers', async () => {
    const res = await h.auth('GET', '/api/v1/suppliers');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 2);
  });
  it('creates a buyer', async () => {
    const res = await h.auth('POST', '/api/v1/buyers', { tenantId: TENANT_TZ, code: 'BUY-TEST-01', name: 'Test Grain Buyer', country: 'TZ' });
    assert.equal(res.status, 201);
  });
  it('rejects duplicate buyer code', async () => {
    const res = await h.auth('POST', '/api/v1/buyers', { tenantId: TENANT_TZ, code: 'BUY-TEST-01', name: 'Dup' });
    assert.equal(res.status, 409);
  });
});

describe('purchase orders', () => {
  it('creates a PO with computed totals', async () => {
    const res = await h.auth('POST', '/api/v1/purchase-orders', {
      supplierId: SUPPLIER_TFC, orderDate: '2026-02-01', currency: 'TZS',
      lines: [
        { description: 'Urea 46% N', quantity: 2000, unit: 'kg', unitPrice: 3200 },
        { description: 'DAP 18-46-0', quantity: 1500, unit: 'kg', unitPrice: 4100 },
      ],
    });
    assert.equal(res.status, 201);
    poId = (res.body as any).id;
    assert.equal((res.body as any).status, 'DRAFT');
    assert.equal(Number((res.body as any).total_amount), 2000 * 3200 + 1500 * 4100);
  });
  it('rejects a PO without lines', async () => {
    const res = await h.auth('POST', '/api/v1/purchase-orders', { supplierId: SUPPLIER_TFC, orderDate: '2026-02-01', currency: 'TZS', lines: [] });
    assert.equal(res.status, 400);
  });
  it('walks the lifecycle DRAFT→SUBMITTED→APPROVED→FULFILLED', async () => {
    assert.equal((await h.auth('POST', `/api/v1/purchase-orders/${poId}/transition`, { status: 'SUBMITTED' })).status, 200);
    assert.equal((await h.auth('POST', `/api/v1/purchase-orders/${poId}/transition`, { status: 'APPROVED' })).status, 200);
    const done = await h.auth('POST', `/api/v1/purchase-orders/${poId}/transition`, { status: 'FULFILLED' });
    assert.equal(done.status, 200);
    assert.equal((done.body as any).after.finance_status, 'PENDING_INTEGRATION');
  });
  it('rejects illegal transitions', async () => {
    const res = await h.auth('POST', `/api/v1/purchase-orders/${poId}/transition`, { status: 'SUBMITTED' });
    assert.equal(res.status, 409);
  });
  it('lists POs with lines attached', async () => {
    const res = await h.auth('GET', `/api/v1/purchase-orders?supplierId=${SUPPLIER_TFC}`);
    const po = (res.body as any).items.find((p: any) => p.id === poId);
    assert.ok(po);
    assert.equal(po.lines.length, 2);
    assert.equal(po.supplier_name, 'Tanzania Fertiliser Company');
  });
});

describe('sales orders', () => {
  it('creates an SO against the storage lot', async () => {
    const res = await h.auth('POST', '/api/v1/sales-orders', {
      buyerId: BUYER_KARIBU, orderDate: '2026-06-02', storageLotId: lotId, currency: 'TZS',
      lines: [{ description: 'Saro 5 paddy rice', quantity: 20000, unit: 'kg', unitPrice: 1800 }],
    });
    assert.equal(res.status, 201);
    soId = (res.body as any).id;
    assert.equal(Number((res.body as any).total_amount), 36000000);
  });
  it('refuses to sell more kg than the lot holds', async () => {
    const res = await h.auth('POST', '/api/v1/sales-orders', {
      buyerId: BUYER_KARIBU, orderDate: '2026-06-03', storageLotId: lotId, currency: 'TZS',
      lines: [{ description: 'Paddy', quantity: 999999, unit: 'kg', unitPrice: 1 }],
    });
    assert.equal(res.status, 400);
  });
  it('fulfilment releases the lot quantity', async () => {
    await h.auth('POST', `/api/v1/sales-orders/${soId}/transition`, { status: 'SUBMITTED' });
    await h.auth('POST', `/api/v1/sales-orders/${soId}/transition`, { status: 'APPROVED' });
    const done = await h.auth('POST', `/api/v1/sales-orders/${soId}/transition`, { status: 'FULFILLED' });
    assert.equal(done.status, 200);
    const lot = await h.auth('GET', '/api/v1/storage-lots');
    const mine = (lot.body as any).items.find((l: any) => l.id === lotId);
    assert.equal(Number(mine.quantity_released_kg), 20000);
  });
  it('shows the sales order in lot traceability', async () => {
    const res = await h.auth('GET', `/api/v1/traceability/lots/${lotId}`);
    assert.ok((res.body as any).salesOrders.some((s: any) => s.id === soId));
  });
});

describe('trade contracts', () => {
  it('creates an off-take contract', async () => {
    const res = await h.auth('POST', '/api/v1/contracts', { counterpartyType: 'BUYER', counterpartyId: BUYER_KARIBU, startDate: '2026-07-01', endDate: '2027-06-30', currency: 'TZS', contractedValue: 250000000, terms: 'Minimum 200t paddy per quarter.' });
    assert.equal(res.status, 201);
    contractId = (res.body as any).id;
    assert.equal((res.body as any).finance_status, 'PENDING_INTEGRATION');
  });
  it('activates and terminates with state machine', async () => {
    assert.equal((await h.auth('POST', `/api/v1/contracts/${contractId}/transition`, { status: 'ACTIVE' })).status, 200);
    assert.equal((await h.auth('POST', `/api/v1/contracts/${contractId}/transition`, { status: 'TERMINATED' })).status, 200);
    assert.equal((await h.auth('POST', `/api/v1/contracts/${contractId}/transition`, { status: 'ACTIVE' })).status, 409);
  });
  it('rejects a buyer from another tenant', async () => {
    const res = await h.auth('POST', '/api/v1/contracts', { counterpartyType: 'BUYER', counterpartyId: '11111111-1111-1111-1111-111111111111', startDate: '2026-07-01', currency: 'TZS', contractedValue: 1 });
    assert.equal(res.status, 404);
  });
});
