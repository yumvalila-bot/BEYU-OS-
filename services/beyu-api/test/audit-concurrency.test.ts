/**
 * Concurrent appends must not fork the hash chain.
 *
 * Two writers reading the same tail would each claim the same predecessor,
 * producing two records with identical previous_hash — a fork that
 * verifyAuditChain() would report as corruption. append() takes an EXCLUSIVE
 * table lock to serialize this; the test proves the lock does its job.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { closeDatabase, getDatabase, setDatabase, type Database } from '../src/db/driver';
import { migrate } from '../src/db/migrator';
import { AuditRepository } from '../src/modules/audit/audit.repository';

describe('audit chain concurrency', () => {
  let db: Database;
  let repo: AuditRepository;
  let dataDir: string;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'beyu-audit-conc-'));
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

  it('produces a single unforked chain under parallel appends', async () => {
    const N = 25;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        repo.append({
          actorUserId: null,
          actorType: 'SYSTEM',
          tenantId: null,
          organizationId: null,
          osId: 'beyu-os',
          action: 'CONCURRENT_WRITE',
          resourceType: 'Test',
          resourceId: String(i),
          outcome: 'SUCCESS',
        }),
      ),
    );

    const events = await repo.list();
    assert.equal(events.length, N);

    // No two records may share a predecessor.
    const previousHashes = new Set(events.map((e) => e.previousHash));
    assert.equal(previousHashes.size, N, 'chain forked: duplicate previous_hash');

    // Sequences must be dense and gap-free.
    const sequences = events.map((e) => e.sequence);
    assert.deepEqual(sequences, Array.from({ length: N }, (_, i) => i + 1));

    const verification = await repo.verify();
    assert.equal(verification.valid, true, verification.reason ?? '');
    assert.equal(verification.checkedCount, N);
  });
});
