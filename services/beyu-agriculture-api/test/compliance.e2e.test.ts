/**
 * Compliance surface: certifications, inspections, and RBAC scoping for the
 * compliance module. Runs as COMPLIANCE_OFFICER where possible and SUPER_ADMIN
 * for cross-cutting assertions.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, HARNESS_PASSWORD, FARM_KILOMBERO } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;
let certId: string;
let officerToken: string;
let managerToken: string;

before(async () => {
  h = await boot('compliance', ['SUPER_ADMIN']);
  await h.createUser('compliance.officer@beyu.agriculture', HARNESS_PASSWORD, ['COMPLIANCE_OFFICER'], TENANT_TZ, null);
  officerToken = await h.loginAs('compliance.officer@beyu.agriculture', HARNESS_PASSWORD);
  await h.createUser('compliance.manager@beyu.agriculture', HARNESS_PASSWORD, ['FARM_MANAGER'], TENANT_TZ, FARM_KILOMBERO);
  managerToken = await h.loginAs('compliance.manager@beyu.agriculture', HARNESS_PASSWORD);
});
after(async () => { await h.close(); });

describe('certifications', () => {
  it('officer creates a farm certification', async () => {
    const res = await h.auth('POST', '/api/v1/certifications', {
      tenantId: TENANT_TZ, farmId: FARM_KILOMBERO, certificationType: 'GLOBAL_GAP',
      certificateNumber: 'GG-TZ-2026-042', issuedOn: '2026-01-15', expiresOn: '2027-01-14',
      issuedBy: 'Control Union', scopeNotes: 'Rice block A',
    }, officerToken);
    assert.equal(res.status, 201);
    certId = (res.body as any).id;
    assert.ok(certId);
  });

  it('duplicate certificate number per tenant is rejected', async () => {
    const res = await h.auth('POST', '/api/v1/certifications', {
      tenantId: TENANT_TZ, farmId: FARM_KILOMBERO, certificationType: 'ORGANIC',
      certificateNumber: 'GG-TZ-2026-042',
    }, officerToken);
    assert.equal(res.status, 409);
  });

  it('lists certifications scoped to the tenant', async () => {
    const res = await h.auth('GET', '/api/v1/certifications', undefined, officerToken);
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.some(c => c.id === certId));
    assert.ok(items.every(c => c.tenant_id === TENANT_TZ));
  });

  it('rejects an unknown certification type at the boundary', async () => {
    const res = await h.auth('POST', '/api/v1/certifications', {
      tenantId: TENANT_TZ, certificationType: 'MADE_UP', certificateNumber: 'X-1',
    }, officerToken);
    assert.equal(res.status, 400);
  });
});

describe('inspections', () => {
  it('officer records a passing inspection linked to the certification', async () => {
    const res = await h.auth('POST', '/api/v1/inspections', {
      tenantId: TENANT_TZ, farmId: FARM_KILOMBERO, certificationId: certId,
      inspectedOn: '2026-02-01', inspectedBy: 'TBS Inspector', result: 'PASS',
      findings: 'No non-conformities', followUpRequired: false,
    }, officerToken);
    assert.equal(res.status, 201);
    assert.ok((res.body as any).id);
  });

  it('rejects an invalid inspection result', async () => {
    const res = await h.auth('POST', '/api/v1/inspections', {
      tenantId: TENANT_TZ, inspectedOn: '2026-02-02', result: 'MAYBE',
    }, officerToken);
    assert.equal(res.status, 400);
  });

  it('lists inspections scoped to the tenant', async () => {
    const res = await h.auth('GET', '/api/v1/inspections', undefined, officerToken);
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1);
    assert.ok(items.every(i => i.tenant_id === TENANT_TZ));
  });
});

describe('compliance RBAC', () => {
  it('farm managers cannot create certifications', async () => {
    const res = await h.auth('POST', '/api/v1/certifications', {
      tenantId: TENANT_TZ, certificationType: 'HACCP', certificateNumber: 'H-1',
    }, managerToken);
    assert.equal(res.status, 403);
  });

  it('unauthenticated callers are rejected', async () => {
    // h.request sends no Authorization header at all (h.auth falls back to
    // the admin token when none is given).
    const res = await h.request('GET', '/api/v1/certifications');
    assert.equal(res.status, 401);
  });
});
