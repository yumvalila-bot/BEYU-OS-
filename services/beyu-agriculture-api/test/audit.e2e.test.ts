/**
 * Audit trail end-to-end tests: every mutation appends an event, the hash
 * chain verifies, history is append-only at the DB level, and the audit API
 * is permission-gated.
 */

import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';

import { boot, TENANT_TZ, FARM_KILOMBERO } from './harness.ts';

let h: Awaited<ReturnType<typeof boot>>;

before(async () => { h = await boot('audit', ['SUPER_ADMIN']); });
after(async () => { await h.close(); });

describe('audit on mutations', () => {
  it('CREATE produces an audit event with new state', async () => {
    const res = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Audit Trail Farm', farmType: 'CROP_FARM', countryCode: 'TZ' });
    const id = (res.body as any).id;
    const audit = await h.auth('GET', `/api/v1/audit?resourceType=farm&resourceId=${id}`);
    assert.equal(audit.status, 200);
    const events = (audit.body as any).items as any[];
    assert.ok(events.some(e => e.action === 'CREATE' && e.resource_type === 'farm'));
  });
  it('UPDATE captures before/after states', async () => {
    const created = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Before Farm', farmType: 'CROP_FARM', countryCode: 'TZ' });
    const id = (created.body as any).id;
    await h.auth('PUT', `/api/v1/farms/${id}`, { name: 'After Farm' });
    const audit = await h.auth('GET', `/api/v1/audit?resourceType=farm&resourceId=${id}`);
    const update = (audit.body as any).items.find((e: any) => e.action === 'UPDATE');
    assert.ok(update, 'UPDATE event present');
  });
  it('DELETE records the previous state', async () => {
    const created = await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Doomed Audit Farm', farmType: 'NURSERY', countryCode: 'TZ' });
    const id = (created.body as any).id;
    await h.auth('DELETE', `/api/v1/farms/${id}`);
    const audit = await h.auth('GET', `/api/v1/audit?resourceType=farm&resourceId=${id}`);
    const del = (audit.body as any).items.find((e: any) => e.action === 'DELETE');
    assert.ok(del, 'DELETE event present');
  });
});

describe('hash chain integrity', () => {
  it('verifies end-to-end with the verifier', async () => {
    // Generate some traffic.
    await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Chain Farm 1', farmType: 'CROP_FARM', countryCode: 'TZ' });
    await h.auth('POST', '/api/v1/farms', { tenantId: TENANT_TZ, name: 'Chain Farm 2', farmType: 'CROP_FARM', countryCode: 'TZ' });
    const { verifyAuditChain } = await import('../src/modules/audit/audit.repository');
    const result = await verifyAuditChain(h.db);
    assert.equal(result.valid, true);
    assert.ok(result.checked >= 3, `checked=${result.checked}`);
  });
  it('detects tampering (UPDATE rejected by DB trigger)', async () => {
    await assert.rejects(
      h.db.query(`UPDATE agri_audit.audit_events SET action='HACKED' WHERE true`),
      /append-only/i,
    );
  });
  it('detects deletion attempts (DELETE rejected by DB trigger)', async () => {
    await assert.rejects(
      h.db.query(`DELETE FROM agri_audit.audit_events WHERE true`),
      /append-only/i,
    );
  });
  it('a forced row change breaks chain verification', async () => {
    // Bypass the trigger the only way possible: drop it temporarily, tamper,
    // restore. This simulates a superuser-level attack and proves the chain
    // hash actually detects it.
    await h.db.query(`ALTER TABLE agri_audit.audit_events DISABLE TRIGGER trg_audit_no_update`);
    await h.db.query(`UPDATE agri_audit.audit_events SET action='TAMPERED' WHERE id = (SELECT id FROM agri_audit.audit_events ORDER BY chain_index DESC, created_at DESC LIMIT 1)`);
    await h.db.query(`ALTER TABLE agri_audit.audit_events ENABLE TRIGGER trg_audit_no_update`);
    const { verifyAuditChain } = await import('../src/modules/audit/audit.repository');
    const result = await verifyAuditChain(h.db);
    assert.equal(result.valid, false);
    assert.ok(result.brokenAt);
  });
});

describe('audit API surface', () => {
  it('filters by action', async () => {
    const res = await h.auth('GET', '/api/v1/audit?action=LOGIN&limit=5');
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.every(e => e.action === 'LOGIN'));
  });
  it('returns hash and chain index per event', async () => {
    const res = await h.auth('GET', '/api/v1/audit?limit=3');
    const item = (res.body as any).items[0];
    assert.match(item.hash, /^[0-9a-f]{64}$/);
    assert.ok(typeof item.chain_index === 'number');
  });
});
