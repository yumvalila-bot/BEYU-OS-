/**
 * Organization hierarchy end-to-end tests (spec §1, §2, §18, §86).
 *
 * These guard the invariants the owner called out as non-negotiable, at the
 * HTTP boundary where a client could actually violate them:
 *   - "BEYU GROUP" is never an accepted name.
 *   - BEYU FOUNDATION is a SISTER of BEYU HOLDING COMPANY, not a subsidiary.
 *   - BEYU OS stops at the SECTOR_LLC boundary.
 *   - The tree stays a tree: one root, no cycles, paths consistent after moves.
 *
 * The canonical spine (Trust → Holding, plus the Foundation sister) is created
 * by the seed, so these tests build on it rather than recreating it — which is
 * also how a real deployment starts.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { OrgNodeType } from '@beyu/types';

import { boot, type Harness } from './harness';

let h: Harness;

const spine: Record<string, string> = {};

/** The API's error envelope is `{ error: { message, ... } }`. */
function message(body: any): string {
  return String(body?.error?.message ?? body?.message ?? '');
}

before(async () => {
  h = await boot('orgs');

  const seeded = await h.db.query<{ id: string; node_type: string }>(
    "SELECT id, node_type FROM organization.org_nodes WHERE parent_id IS NULL OR node_type IN ('HOLDING_COMPANY','FOUNDATION')",
  );
  for (const row of seeded.rows) {
    if (row.node_type === 'TRUST') spine.trust = row.id;
    if (row.node_type === 'HOLDING_COMPANY') spine.holding = row.id;
    if (row.node_type === 'FOUNDATION') spine.foundation = row.id;
  }
  assert.ok(spine.trust && spine.holding && spine.foundation, 'The seed must plant the spine.');

  const country = await h.auth('POST', '/api/v1/organizations', {
    nodeType: OrgNodeType.CountryHolding,
    name: 'BEYU TANZANIA HOLDING',
    parentId: spine.holding,
    countryCode: 'TZ',
  });
  assert.equal(country.status, 201, JSON.stringify(country.body));
  spine.country = country.body.id;
});

after(async () => {
  await h?.close();
});

describe('canonical naming', () => {
  it('rejects the forbidden parent-organization name', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.CountryHolding,
      name: 'BeYu  group',
      parentId: spine.holding,
      countryCode: 'KE',
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('rejects the forbidden name in the legal name too', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.CountryHolding,
      name: 'A Legitimate Name',
      legalName: 'BEYU GROUP',
      parentId: spine.holding,
      countryCode: 'KE',
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

describe('canonical hierarchy', () => {
  it('keeps BEYU FOUNDATION a sister of the holding company, under the Trust', async () => {
    const res = await h.auth('GET', `/api/v1/organizations/${spine.foundation}`);
    assert.equal(res.status, 200);
    assert.equal(
      res.body.parentId,
      spine.trust,
      'The Foundation must hang off the Trust, never off the holding company.',
    );
  });

  it('refuses to make a Foundation a subsidiary of the holding company', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.Foundation,
      name: 'BEYU FOUNDATION (WRONG PARENT)',
      parentId: spine.holding,
    });
    assert.equal(res.status, 400);
    assert.match(
      message(res.body),
      /sister organization/i,
      'The refusal must explain the sister-organization rule, not just say "invalid parent".',
    );
  });

  it('refuses to move the Foundation under the holding company', async () => {
    const res = await h.auth('POST', `/api/v1/organizations/${spine.foundation}/move`, {
      newParentId: spine.holding,
      reason: 'Attempting to demote the Foundation into a subsidiary position.',
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /sister organization/i);
  });

  it('refuses a second root', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.Trust,
      name: 'A SECOND TRUST',
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /single root/i);
  });

  it('refuses a sector LLC parented directly to the trust', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.SectorLLC,
      name: 'MISPLACED SECTOR LLC',
      parentId: spine.trust,
      sectorCode: 'HEALTH',
    });
    assert.equal(res.status, 400);
  });

  it('requires a country code on a country holding', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.CountryHolding,
      name: 'NO COUNTRY HOLDING',
      parentId: spine.holding,
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /countryCode/i);
  });

  it('requires a sector code on a sector LLC', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.SectorLLC,
      name: 'NO SECTOR LLC',
      parentId: spine.country,
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /sectorCode/i);
  });
});

describe('BEYU OS boundary', () => {
  it('accepts a sector LLC, the lowest node BEYU OS governs', async () => {
    const res = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.SectorLLC,
      name: 'BEYU HEALTH TANZANIA LLC',
      parentId: spine.country,
      sectorCode: 'HEALTH',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    spine.sector = res.body.id;
  });

  it('inherits the country from the parent holding', async () => {
    const res = await h.auth('GET', `/api/v1/organizations/${spine.sector}`);
    assert.equal(res.body.countryCode, 'TZ');
  });

  it('refuses to create anything below the sector LLC boundary', async () => {
    for (const nodeType of [
      OrgNodeType.SectorOS,
      OrgNodeType.Tenant,
      OrgNodeType.Division,
      OrgNodeType.Department,
      OrgNodeType.Team,
    ]) {
      const res = await h.auth('POST', '/api/v1/organizations', {
        nodeType,
        name: `Below boundary ${nodeType}`,
        parentId: spine.sector,
      });
      assert.equal(
        res.status,
        400,
        `${nodeType} is below the BEYU OS boundary and must be refused.`,
      );
      assert.match(message(res.body), /boundary/i);
    }
  });
});

describe('materialized path', () => {
  it('builds a root-to-node chain and correct depth', async () => {
    const res = await h.auth('GET', `/api/v1/organizations/${spine.sector}/ancestors`);
    assert.equal(res.status, 200);
    const ids = res.body.map((n: { id: string }) => n.id);
    assert.deepEqual(ids, [spine.trust, spine.holding, spine.country, spine.sector]);
    assert.deepEqual(
      res.body.map((n: { depth?: number }) => n.depth ?? null),
      [0, 1, 2, 3],
    );
  });

  it('returns a nested subtree from the root', async () => {
    const res = await h.auth('GET', `/api/v1/organizations/${spine.trust}/subtree`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, spine.trust);
    const childNames = res.body.children.map((c: { name: string }) => c.name).sort();
    assert.deepEqual(childNames, ['BEYU FOUNDATION', 'BEYU HOLDING COMPANY']);
  });

  it('rewrites descendant paths when a node moves', async () => {
    const other = await h.auth('POST', '/api/v1/organizations', {
      nodeType: OrgNodeType.CountryHolding,
      name: 'BEYU KENYA HOLDING',
      parentId: spine.holding,
      countryCode: 'KE',
    });
    assert.equal(other.status, 201, JSON.stringify(other.body));

    const moved = await h.auth('POST', `/api/v1/organizations/${spine.sector}/move`, {
      newParentId: other.body.id,
      reason: 'Restructuring the sector under the Kenyan holding company.',
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));

    const ancestors = await h.auth('GET', `/api/v1/organizations/${spine.sector}/ancestors`);
    const ids = ancestors.body.map((n: { id: string }) => n.id);
    assert.deepEqual(ids, [spine.trust, spine.holding, other.body.id, spine.sector]);

    // Move it back so later assertions see the original shape.
    const back = await h.auth('POST', `/api/v1/organizations/${spine.sector}/move`, {
      newParentId: spine.country,
      reason: 'Reverting the restructuring performed by the previous assertion.',
    });
    assert.equal(back.status, 200, JSON.stringify(back.body));
  });

  it('refuses a move that would parent a node under its own descendant', async () => {
    const res = await h.auth('POST', `/api/v1/organizations/${spine.holding}/move`, {
      newParentId: spine.country,
      reason: 'This would detach the subtree from the root and must be refused.',
    });
    assert.equal(res.status, 400);
    assert.match(message(res.body), /descendant/i);
  });

  it('requires a substantive reason for a move', async () => {
    const res = await h.auth('POST', `/api/v1/organizations/${spine.sector}/move`, {
      newParentId: spine.country,
      reason: 'why',
    });
    assert.equal(res.status, 400);
  });
});

describe('authorization and audit', () => {
  it('rejects an unauthenticated read', async () => {
    // 401, not 403: the caller presented no identity at all.
    const res = await h.request('GET', '/api/v1/organizations');
    assert.equal(res.status, 401);
  });

  it('records organization creation in the hash chain', async () => {
    const res = await h.auth('GET', '/api/v1/audit?limit=200');
    assert.equal(res.status, 200);
    const creates = res.body.items.filter(
      (e: { resourceType: string; action: string }) =>
        e.resourceType === 'organization' && e.action === 'CREATE',
    );
    assert.ok(creates.length >= 3, 'Every organization creation must be audited.');

    const verify = await h.auth('GET', '/api/v1/audit/verify');
    assert.equal(verify.body.valid, true, 'The chain must remain intact after domain writes.');
  });
});
