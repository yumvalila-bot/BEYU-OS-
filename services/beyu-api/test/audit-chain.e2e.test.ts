/**
 * End-to-end audit chain test against a real PostgreSQL engine (PGlite).
 *
 * This guards the integration seam that unit tests cannot reach: the hash is
 * computed in TypeScript but the record round-trips through PostgreSQL. If the
 * column types, precision, or naming drift from what computeAuditHash() is fed,
 * verification breaks — and it breaks silently, which is the dangerous part.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { verifyAuditChain } from '@beyu/security';
import { CANONICAL_PARENT_ORGANIZATION, OrgNodeType } from '@beyu/types';
import { closeDatabase, getDatabase, setDatabase, type Database } from '../src/db/driver';
import { migrate } from '../src/db/migrator';
import { seed } from '../src/db/seed';
import { AuditRepository } from '../src/modules/audit/audit.repository';

describe('audit chain (end-to-end against PostgreSQL)', () => {
  let db: Database;
  let repo: AuditRepository;
  let dataDir: string;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'beyu-audit-'));
    process.env.DATABASE_DRIVER = 'pglite';
    process.env.PGLITE_DATA_DIR = dataDir;
    setDatabase(null);
    db = getDatabase();
    await migrate(db, { log: () => {} });
    repo = new AuditRepository(db);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('applies all migrations and seeds the canonical hierarchy', async () => {
    const result = await seed(db, { log: () => {} } as never);
    assert.equal(result.alreadyPresent, false);

    // The seed must never invent a parent other than BEYU FAMILY TRUST.
    const root = await db.query<{ name: string; node_type: string }>(
      "SELECT name, node_type FROM organization.org_nodes WHERE parent_id IS NULL",
    );
    assert.equal(root.rows.length, 1);
    assert.equal(root.rows[0].name, CANONICAL_PARENT_ORGANIZATION);
    assert.equal(root.rows[0].node_type, OrgNodeType.Trust);
  });

  it('stores BEYU FOUNDATION as a sister of the holding company, not below it', async () => {
    const rows = await db.query<{ name: string; parent_type: string }>(
      `SELECT child.name, parent.node_type AS parent_type
         FROM organization.org_nodes child
         JOIN organization.org_nodes parent ON parent.id = child.parent_id
        WHERE child.node_type = $1`,
      [OrgNodeType.Foundation],
    );
    assert.equal(rows.rows.length, 1);
    // Directly under the Trust — never under the Holding Company.
    assert.equal(rows.rows[0].parent_type, OrgNodeType.Trust);
  });

  it('keeps the node_type CHECK constraint in sync with OrgNodeType', async () => {
    // If someone adds a node type in TypeScript but forgets the migration
    // (or vice versa), inserts fail at runtime in production. Catch it here.
    const constraint = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'organization.org_nodes'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%node_type%'
          AND pg_get_constraintdef(oid) LIKE '%ANY%'`,
    );
    assert.ok(constraint.rows.length >= 1, 'expected a node_type CHECK constraint');
    const def = constraint.rows.map((r) => r.def).join(' ');
    for (const value of Object.values(OrgNodeType)) {
      assert.ok(def.includes(`'${value}'`), `node_type CHECK is missing ${value}`);
    }
  });

  it('writes a verifiable chain that survives the database round-trip', async () => {
    for (let i = 1; i <= 5; i++) {
      await repo.append({
        actorUserId: null,
        actorType: 'SYSTEM',
        tenantId: null,
        organizationId: null,
        osId: 'beyu-os',
        action: `TEST_ACTION_${i}`,
        resourceType: 'Test',
        resourceId: String(i),
        outcome: 'SUCCESS',
        // Deliberately unordered keys: canonicalJson must sort them so the
        // hash does not depend on JS object insertion order.
        newState: { i, nested: { b: 2, a: 1 } },
      });
    }

    const verification = await repo.verify();
    assert.equal(verification.valid, true, verification.reason ?? '');
    assert.equal(verification.checkedCount, 5);
  });

  it('records each verification run for later inspection', async () => {
    const runs = await db.query<{ valid: boolean; checked_count: string }>(
      'SELECT valid, checked_count FROM audit.chain_verifications ORDER BY verified_at DESC LIMIT 1',
    );
    assert.equal(runs.rows[0].valid, true);
    assert.equal(Number(runs.rows[0].checked_count), 5);
  });

  it('detects tampering with a stored record', async () => {
    const events = await repo.list();
    const tampered = events.map((e) => ({ ...e }));
    tampered[2].action = 'MUTATED';

    const result = verifyAuditChain(tampered);
    assert.equal(result.valid, false);
    assert.equal(result.brokenAtSequence, tampered[2].sequence);
  });

  it('detects a removed record (chain gap)', async () => {
    const events = await repo.list();
    const withHole = [...events.slice(0, 2), ...events.slice(3)];

    const result = verifyAuditChain(withHole);
    assert.equal(result.valid, false);
  });

  it('refuses UPDATE and DELETE at the database level', async () => {
    await assert.rejects(
      () => db.query("UPDATE audit.audit_log SET action = 'HACKED' WHERE sequence = 1"),
      /append-only|immutable|not allowed/i,
    );
    await assert.rejects(
      () => db.query('DELETE FROM audit.audit_log WHERE sequence = 1'),
      /append-only|immutable|not allowed/i,
    );
  });
});
