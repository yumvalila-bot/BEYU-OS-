/**
 * Audit read-surface tests (spec §39).
 *
 * The trail is the one screen an auditor will actually open, and the ordering
 * it shows is a correctness claim, not a cosmetic choice. `GET /audit` walks
 * the chain forwards because verification needs it that way; the reviewer
 * wants the newest entries. These tests pin both behaviours so the two cannot
 * be quietly swapped, which would leave the UI truthfully labelled and wrong.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { boot, type Harness } from './harness';

let h: Harness;

interface TrailBody {
  items: { sequence: number | string; action: string }[];
  count: number;
}

before(async () => {
  h = await boot('audit-read');

  // Generate a handful of audited events so ordering is observable. Reads of
  // the organization tree are audited, so this also proves @AuditRead() fires.
  for (let i = 0; i < 4; i++) {
    await h.auth('GET', '/api/v1/organizations');
  }
});

after(async () => {
  await h.close();
});

describe('audit trail ordering', () => {
  it('walks the chain forwards by default', async () => {
    const res = await h.auth('GET', '/api/v1/audit?limit=5');
    assert.equal(res.status, 200);

    const body = res.body as TrailBody;
    const sequences = body.items.map((e) => Number(e.sequence));
    assert.ok(sequences.length > 1, 'expected several audit records');
    assert.deepEqual(
      sequences,
      [...sequences].sort((a, b) => a - b),
      'the default order must be ascending, as verification reads it',
    );
    assert.equal(sequences[0], 1, 'the default order must start at the beginning of the chain');
  });

  it('returns the newest entries first with order=desc', async () => {
    // Reading the trail is itself an audited event, so the chain grows while
    // this test observes it. Comparing two HTTP reads would race; bracketing
    // the call between two direct database reads does not.
    const maxSequence = async (): Promise<number> => {
      const rows = await h.db.query<{ max: string | null }>(
        'SELECT max(sequence) AS max FROM audit.audit_log',
      );
      return Number(rows.rows[0].max ?? 0);
    };

    const before = await maxSequence();
    const descending = await h.auth('GET', '/api/v1/audit?limit=5&order=desc');
    assert.equal(descending.status, 200);
    const after = await maxSequence();

    const tail = (descending.body as TrailBody).items.map((e) => Number(e.sequence));

    assert.deepEqual(
      tail,
      [...tail].sort((a, b) => b - a),
      'order=desc must return descending sequences',
    );
    assert.ok(
      tail[0] >= before && tail[0] <= after,
      `order=desc must start at the end of the chain (got ${tail[0]}, chain was ${before}..${after})`,
    );
  });

  it('reports how many records it returned', async () => {
    const res = await h.auth('GET', '/api/v1/audit?limit=3&order=desc');
    const body = res.body as TrailBody;
    assert.equal(body.count, body.items.length);
    assert.ok(body.items.length <= 3);
  });

  it('offers no way to write, alter or delete a record through the API', async () => {
    // Absence of a route is the guarantee; a 404/405 here is the pass.
    for (const [method, path] of [
      ['POST', '/api/v1/audit'],
      ['PATCH', '/api/v1/audit/1'],
      ['PUT', '/api/v1/audit/1'],
      ['DELETE', '/api/v1/audit/1'],
    ] as const) {
      const res = await h.auth(method, path, method === 'POST' ? {} : undefined);
      assert.ok(
        res.status === 404 || res.status === 405 || res.status === 403,
        `${method} ${path} must not be a working endpoint (got ${res.status})`,
      );
    }
  });

  it('leaves the chain valid after all of this reading', async () => {
    const res = await h.auth('GET', '/api/v1/audit/verify');
    assert.equal(res.status, 200);
    assert.equal((res.body as { valid: boolean }).valid, true);
  });
});
