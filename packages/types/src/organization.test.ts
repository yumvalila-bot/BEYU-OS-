/**
 * Canonical hierarchy tests (spec §2, §86.2).
 *
 * These encode the two naming/structure rules the owner called out explicitly:
 * the parent is BEYU FAMILY TRUST and is never called "BEYU GROUP", and BEYU
 * FOUNDATION is a sister of the holding company rather than a subsidiary.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertOrganizationNameAllowed,
  BEYU_OS_GOVERNED_NODES,
  CANONICAL_PARENT_ORGANIZATION,
  FORBIDDEN_ORGANIZATION_NAMES,
  OrgNodeType,
  validateHierarchy,
} from './organization';

describe('canonical naming', () => {
  it('names the parent organization BEYU FAMILY TRUST', () => {
    assert.equal(CANONICAL_PARENT_ORGANIZATION, 'BEYU FAMILY TRUST');
  });

  it('forbids "BEYU GROUP" in any casing or padding', () => {
    for (const name of ['BEYU GROUP', 'beyu group', '  Beyu Group  ']) {
      assert.throws(() => assertOrganizationNameAllowed(name), /forbidden/i, `${name} must be rejected`);
    }
  });

  it('lists BEYU GROUP among the forbidden names', () => {
    assert.ok(FORBIDDEN_ORGANIZATION_NAMES.includes('BEYU GROUP'));
  });

  it('accepts legitimate organization names', () => {
    for (const name of ['BEYU FAMILY TRUST', 'BEYU HOLDING COMPANY', 'BEYU FOUNDATION']) {
      assert.doesNotThrow(() => assertOrganizationNameAllowed(name));
    }
  });
});

describe('validateHierarchy', () => {
  it('accepts the canonical chain', () => {
    assert.equal(validateHierarchy(OrgNodeType.Trust, null).valid, true);
    assert.equal(validateHierarchy(OrgNodeType.HoldingCompany, OrgNodeType.Trust).valid, true);
    assert.equal(
      validateHierarchy(OrgNodeType.CountryHolding, OrgNodeType.HoldingCompany).valid,
      true,
    );
    assert.equal(validateHierarchy(OrgNodeType.SectorLLC, OrgNodeType.CountryHolding).valid, true);
  });

  it('treats BEYU FOUNDATION as a sister, not a subsidiary', () => {
    // Directly under the Trust: valid.
    assert.equal(validateHierarchy(OrgNodeType.Foundation, OrgNodeType.Trust).valid, true);

    // Under the Holding Company: invalid, with an explanatory reason.
    const invalid = validateHierarchy(OrgNodeType.Foundation, OrgNodeType.HoldingCompany);
    assert.equal(invalid.valid, false);
    assert.match(invalid.reason ?? '', /sister organization/i);
  });

  it('requires the Trust to be the root and nothing else', () => {
    assert.equal(validateHierarchy(OrgNodeType.Trust, OrgNodeType.HoldingCompany).valid, false);
    assert.equal(validateHierarchy(OrgNodeType.HoldingCompany, null).valid, false);
  });

  it('rejects skipping a level in the chain', () => {
    assert.equal(validateHierarchy(OrgNodeType.SectorLLC, OrgNodeType.Trust).valid, false);
    assert.equal(validateHierarchy(OrgNodeType.CountryHolding, OrgNodeType.Trust).valid, false);
  });

  it('rejects an unknown node type', () => {
    assert.equal(validateHierarchy('NOT_A_NODE' as OrgNodeType, OrgNodeType.Trust).valid, false);
  });
});

describe('BEYU OS boundary', () => {
  it('governs down to the Sector LLC and no further', () => {
    assert.deepEqual([...BEYU_OS_GOVERNED_NODES], [
      OrgNodeType.Trust,
      OrgNodeType.HoldingCompany,
      OrgNodeType.CountryHolding,
      OrgNodeType.SectorLLC,
    ]);
  });

  it('excludes sector-internal and foundation-internal nodes', () => {
    // Everything below a Sector LLC belongs to the Sector OS, not BEYU OS.
    for (const node of [
      OrgNodeType.SectorOS,
      OrgNodeType.FoundationOS,
      OrgNodeType.Division,
      OrgNodeType.Department,
      OrgNodeType.Branch,
      OrgNodeType.Team,
    ]) {
      assert.ok(!BEYU_OS_GOVERNED_NODES.includes(node), `${node} must be outside the BEYU OS boundary`);
    }
  });
});
