/**
 * Livestock end-to-end tests: herds, animals, health events, production.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_NJOMBE } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let herdId: string, animalId: string, animalId2: string;

before(async () => { h = await boot('live', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('herds', () => {
  it('creates a herd', async () => {
    const res = await h.auth('POST', '/api/v1/herds', { farmId: FARM_NJOMBE, name: 'Dairy Herd Alpha', species: 'CATTLE', code: 'HRD-ALPHA' });
    assert.equal(res.status, 201);
    herdId = (res.body as any).id;
  });
  it('rejects duplicate herd code in tenant', async () => {
    const res = await h.auth('POST', '/api/v1/herds', { farmId: FARM_NJOMBE, name: 'Dup', species: 'CATTLE', code: 'HRD-ALPHA' });
    assert.equal(res.status, 409);
  });
  it('rejects invalid species', async () => {
    const res = await h.auth('POST', '/api/v1/herds', { farmId: FARM_NJOMBE, name: 'Exotic', species: 'DRAGON', code: 'HRD-X' });
    assert.equal(res.status, 400);
  });
  it('rejects unknown farm', async () => {
    const res = await h.auth('POST', '/api/v1/herds', { farmId: '11111111-1111-1111-1111-111111111111', name: 'X', species: 'GOAT' });
    assert.equal(res.status, 404);
  });
  it('lists herds with active animal counts', async () => {
    const res = await h.auth('GET', `/api/v1/herds?farmId=${FARM_NJOMBE}`);
    assert.equal(res.status, 200);
    const herd = (res.body as any).items.find((x: any) => x.id === herdId);
    assert.ok(herd);
    assert.equal(Number(herd.active_animals), 0);
  });
});

describe('animals', () => {
  it('creates animals', async () => {
    const a = await h.auth('POST', '/api/v1/animals', { herdId, tagNumber: 'TZ-NJO-0001', species: 'CATTLE', breed: 'Friesian', sex: 'FEMALE', dateOfBirth: '2023-04-01' });
    assert.equal(a.status, 201);
    animalId = (a.body as any).id;
    const b = await h.auth('POST', '/api/v1/animals', { herdId, tagNumber: 'TZ-NJO-0002', species: 'CATTLE', breed: 'Jersey', sex: 'FEMALE', dateOfBirth: '2022-09-15' });
    assert.equal(b.status, 201);
    animalId2 = (b.body as any).id;
  });
  it('rejects duplicate tag in tenant', async () => {
    const res = await h.auth('POST', '/api/v1/animals', { herdId, tagNumber: 'TZ-NJO-0001', species: 'CATTLE', sex: 'MALE' });
    assert.equal(res.status, 409);
  });
  it('rejects invalid sex', async () => {
    const res = await h.auth('POST', '/api/v1/animals', { herdId, tagNumber: 'TZ-NJO-0003', species: 'CATTLE', sex: 'OTHER' });
    assert.equal(res.status, 400);
  });
  it('searches by tag', async () => {
    const res = await h.auth('GET', '/api/v1/animals?q=TZ-NJO-0002');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).total, 1);
  });
  it('marks an animal sold', async () => {
    const res = await h.auth('PUT', `/api/v1/animals/${animalId2}`, { status: 'SOLD' });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).after.status, 'SOLD');
  });
});

describe('animal health events', () => {
  it('records a vaccination', async () => {
    const res = await h.auth('POST', '/api/v1/animal-health-events', { animalId, eventType: 'VACCINATION', eventDate: '2026-04-02', veterinarian: 'Dr. Mwakyusa', treatment: 'FMD vaccine', withdrawalDays: 0, costAmount: 15000, costCurrency: 'TZS' });
    assert.equal(res.status, 201);
  });
  it('records illness with withdrawal period', async () => {
    const res = await h.auth('POST', '/api/v1/animal-health-events', { animalId, eventType: 'TREATMENT', eventDate: '2026-05-03', treatment: 'Oxytetracycline', withdrawalDays: 14 });
    assert.equal(res.status, 201);
  });
  it('rejects events on sold animals', async () => {
    const res = await h.auth('POST', '/api/v1/animal-health-events', { animalId: animalId2, eventType: 'CHECKUP', eventDate: '2026-05-04' });
    assert.equal(res.status, 400);
  });
  it('rejects unknown animal', async () => {
    const res = await h.auth('POST', '/api/v1/animal-health-events', { animalId: '11111111-1111-1111-1111-111111111111', eventType: 'CHECKUP', eventDate: '2026-05-04' });
    assert.equal(res.status, 404);
  });
  it('lists health events per animal', async () => {
    const res = await h.auth('GET', `/api/v1/animal-health-events?animalId=${animalId}`);
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 2);
  });
});

describe('production records', () => {
  it('records daily milk', async () => {
    const res = await h.auth('POST', '/api/v1/production-records', { herdId, productionType: 'MILK', recordedOn: '2026-05-05', quantity: 420.5, unit: 'litres' });
    assert.equal(res.status, 201);
  });
  it('records per-animal production', async () => {
    const res = await h.auth('POST', '/api/v1/production-records', { animalId, productionType: 'MILK', recordedOn: '2026-05-05', quantity: 18.0, unit: 'litres' });
    assert.equal(res.status, 201);
  });
  it('rejects missing target', async () => {
    const res = await h.auth('POST', '/api/v1/production-records', { productionType: 'MILK', recordedOn: '2026-05-06', quantity: 1, unit: 'litres' });
    assert.ok([400, 403].includes(res.status));
  });
  it('rejects negative quantity', async () => {
    const res = await h.auth('POST', '/api/v1/production-records', { herdId, productionType: 'EGGS', recordedOn: '2026-05-06', quantity: -3, unit: 'trays' });
    assert.equal(res.status, 400);
  });
  it('filters production by type', async () => {
    const res = await h.auth('GET', '/api/v1/production-records?productionType=MILK');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 2);
  });
});
