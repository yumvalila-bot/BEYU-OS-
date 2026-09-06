/**
 * Farm and land CRUD end-to-end tests: farms, fields, soil, weather.
 * Includes validation, pagination and referential integrity.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_KILOMBERO, FIELD_NORTH_A } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;

before(async () => { h = await boot('farms', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('farms', () => {
  it('lists seeded farms', async () => {
    const res = await h.auth('GET', '/api/v1/farms');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 3);
  });
  it('creates a farm with generated code', async () => {
    const res = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Test Farm Morogoro', farmType: 'CROP_FARM', countryCode: 'TZ', totalAreaHa: 88.5 });
    assert.equal(res.status, 201);
    assert.match((res.body as any).code, /^FRM-\d{2}-\d{4}$/);
    assert.equal((res.body as any).status, 'ACTIVE');
  });
  it('rejects invalid farm type', async () => {
    const res = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'X', farmType: 'SPACE_STATION', countryCode: 'TZ' });
    assert.equal(res.status, 400);
  });
  it('rejects zero/negative area', async () => {
    const res = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'X', farmType: 'CROP_FARM', countryCode: 'TZ', totalAreaHa: -5 });
    assert.equal(res.status, 400);
  });
  it('rejects unknown tenant', async () => {
    const res = await h.auth('POST', '/api/v1/farms', { tenantId: '11111111-1111-1111-1111-111111111111', name: 'X', farmType: 'CROP_FARM', countryCode: 'TZ' });
    assert.equal(res.status, 400);
  });
  it('updates a farm', async () => {
    const res = await h.auth('PUT', `/api/v1/farms/${FARM_KILOMBERO}`, { village: 'Ifakara' });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).after.village, 'Ifakara');
  });
  it('404s on unknown farm', async () => {
    const res = await h.auth('GET', '/api/v1/farms/11111111-1111-1111-1111-111111111111');
    assert.equal(res.status, 404);
  });
  it('searches by name', async () => {
    const res = await h.auth('GET', '/api/v1/farms?q=Kilombero');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).items[0].name, 'Kilombero Rice Estate');
  });
  it('paginates', async () => {
    const res = await h.auth('GET', '/api/v1/farms?limit=2&offset=0');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).items.length <= 2);
  });
  it('soft-deletes a farm', async () => {
    const created = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Doomed Farm', farmType: 'NURSERY', countryCode: 'TZ' });
    const id = (created.body as any).id;
    const del = await h.auth('DELETE', `/api/v1/farms/${id}`);
    assert.equal(del.status, 200);
    const gone = await h.auth('GET', `/api/v1/farms/${id}`);
    assert.equal(gone.status, 404);
  });
});

describe('fields', () => {
  it('lists seeded fields with farm name join', async () => {
    const res = await h.auth('GET', '/api/v1/fields');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).items.some((f: any) => f.farm_name === 'Kilombero Rice Estate'));
  });
  it('creates a field with sequential code', async () => {
    const res = await h.auth('POST', '/api/v1/fields', { farmId: FARM_KILOMBERO, name: 'South Block C', fieldUse: 'CROPLAND', areaHa: 42.5, soilTexture: 'CLAY' });
    assert.equal(res.status, 201);
    assert.match((res.body as any).code, /^FLD-\d{3}$/);
  });
  it('rejects a field on an unknown farm', async () => {
    const res = await h.auth('POST', '/api/v1/fields', { farmId: '11111111-1111-1111-1111-111111111111', name: 'X', fieldUse: 'CROPLAND', areaHa: 1 });
    assert.equal(res.status, 404);
  });
  it('rejects non-positive area', async () => {
    const res = await h.auth('POST', '/api/v1/fields', { farmId: FARM_KILOMBERO, name: 'X', fieldUse: 'CROPLAND', areaHa: 0 });
    assert.equal(res.status, 400);
  });
  it('accepts GeoJSON boundary', async () => {
    const boundary = { type: 'Polygon', coordinates: [[[36.87, -8.39], [36.88, -8.39], [36.88, -8.40], [36.87, -8.40], [36.87, -8.39]]] };
    const res = await h.auth('POST', '/api/v1/fields', { farmId: FARM_KILOMBERO, name: 'Geo Field', fieldUse: 'CROPLAND', areaHa: 5, boundary });
    assert.equal(res.status, 201);
  });
  it('updates field usage', async () => {
    const res = await h.auth('PUT', `/api/v1/fields/${FIELD_NORTH_A}`, { fieldUse: 'FALLOW' });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).after.field_use, 'FALLOW');
  });
});

describe('soil records', () => {
  it('creates and lists soil records', async () => {
    const res = await h.auth('POST', '/api/v1/soil-records', { fieldId: FIELD_NORTH_A, sampledOn: '2026-05-10', ph: 6.2, organicMatterPct: 2.4, nitrogenPPM: 12.5, phosphorusPPM: 8.1, potassiumPPM: 0.3 });
    assert.equal(res.status, 201);
    const list = await h.auth('GET', `/api/v1/soil-records?fieldId=${FIELD_NORTH_A}`);
    assert.equal(list.status, 200);
    assert.ok((list.body as any).total >= 1);
  });
  it('rejects ph out of range', async () => {
    const res = await h.auth('POST', '/api/v1/soil-records', { fieldId: FIELD_NORTH_A, sampledOn: '2026-05-10', ph: 22 });
    assert.equal(res.status, 400);
  });
  it('404s on unknown field', async () => {
    const res = await h.auth('POST', '/api/v1/soil-records', { fieldId: '11111111-1111-1111-1111-111111111111', sampledOn: '2026-05-10' });
    assert.equal(res.status, 404);
  });
});

describe('weather observations', () => {
  it('creates a weather observation', async () => {
    const res = await h.auth('POST', '/api/v1/weather', { farmId: FARM_KILOMBERO, observedOn: '2026-05-11', temperatureC: 29.4, rainfallMm: 12.2, humidityPct: 78 });
    assert.equal(res.status, 201);
  });
  it('rejects negative rainfall', async () => {
    const res = await h.auth('POST', '/api/v1/weather', { farmId: FARM_KILOMBERO, observedOn: '2026-05-12', rainfallMm: -1 });
    assert.equal(res.status, 400);
  });
  it('lists weather by farm', async () => {
    const res = await h.auth('GET', `/api/v1/weather?farmId=${FARM_KILOMBERO}`);
    assert.equal(res.status, 200);
    assert.ok((res.body as any).total >= 1);
  });
});
