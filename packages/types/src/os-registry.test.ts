/**
 * Federation contract tests.
 *
 * These assert the rules that keep three independent OSs attached to one
 * control plane without letting any of them reach the others, or reach past
 * the boundaries the specification draws. They are written against the
 * behaviour a hostile or misconfigured OS would exercise, not against the
 * happy path.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCapabilitiesGrantable,
  canTransitionOsStatus,
  ForbiddenCapabilityError,
  NEVER_GRANTABLE_CAPABILITIES,
  OsAttachmentKind,
  OsCapability,
  OsStatus,
  requiredParentTypeForOs,
} from './os-registry';

describe('OS capability grants', () => {
  it('accepts known capabilities', () => {
    assert.doesNotThrow(() =>
      assertCapabilitiesGrantable([
        OsCapability.OrganizationRead,
        OsCapability.RiskSubmit,
        OsCapability.EventSubscribe,
      ]),
    );
  });

  it('refuses every capability on the deny list', () => {
    // Each of these encodes a specification rule that must survive an
    // operator mistake, so each is asserted individually rather than as a set.
    for (const forbidden of NEVER_GRANTABLE_CAPABILITIES) {
      assert.throws(
        () => assertCapabilitiesGrantable([forbidden]),
        ForbiddenCapabilityError,
        `expected "${forbidden}" to be refused`,
      );
    }
  });

  it('refuses direct database access under any spelling', () => {
    for (const attempt of ['DATABASE_ACCESS', 'database_access', '  Database_Read  ']) {
      assert.throws(() => assertCapabilitiesGrantable([attempt]), ForbiddenCapabilityError);
    }
  });

  it('refuses waterfall execution — BEYU OS decides, Finance OS executes', () => {
    assert.throws(
      () => assertCapabilitiesGrantable(['WATERFALL_EXECUTE']),
      ForbiddenCapabilityError,
    );
    // The read side of the same domain is legitimate.
    assert.doesNotThrow(() =>
      assertCapabilitiesGrantable([OsCapability.WaterfallDecisionRead]),
    );
  });

  it('refuses cross-OS reads, which is what keeps the three OSs isolated', () => {
    assert.throws(() => assertCapabilitiesGrantable(['CROSS_OS_READ']), ForbiddenCapabilityError);
  });

  it('refuses unknown capabilities rather than ignoring them', () => {
    // Silently dropping an unrecognised grant would make a typo look like it
    // worked, which is the worst outcome: the operator believes access was
    // granted and never checks again.
    assert.throws(() => assertCapabilitiesGrantable(['SOMETHING_INVENTED']), ForbiddenCapabilityError);
  });

  it('rejects the whole set when one entry is forbidden', () => {
    assert.throws(
      () =>
        assertCapabilitiesGrantable([
          OsCapability.OrganizationRead,
          'AUTHORIZATION_BYPASS',
          OsCapability.RiskSubmit,
        ]),
      ForbiddenCapabilityError,
    );
  });

  it('grants nothing by default — isolation is the starting position', () => {
    assert.doesNotThrow(() => assertCapabilitiesGrantable([]));
  });

  it('exposes no capability that writes to another OS or moves money', () => {
    // A guard against a future contributor adding a capability that quietly
    // widens the seam. Read/submit/request verbs are safe; execute/approve
    // and anything mentioning another OS are not.
    for (const capability of Object.values(OsCapability)) {
      assert.ok(
        !/_EXECUTE$|_APPROVE$|^CROSS_OS|_DELETE$/.test(capability),
        `capability "${capability}" grants more than the federation seam allows`,
      );
    }
  });
});

describe('OS lifecycle', () => {
  it('cannot reach ACTIVE without passing through security validation', () => {
    // The security review is the whole point of the lifecycle. If an operator
    // could jump REGISTERED -> ACTIVE, the review would be optional.
    assert.equal(canTransitionOsStatus(OsStatus.Registered, OsStatus.Active), false);
    assert.equal(canTransitionOsStatus(OsStatus.Configuring, OsStatus.Active), false);
    assert.equal(canTransitionOsStatus(OsStatus.SecurityValidation, OsStatus.Active), true);
  });

  it('allows security validation to send an OS back for reconfiguration', () => {
    assert.equal(canTransitionOsStatus(OsStatus.SecurityValidation, OsStatus.Configuring), true);
  });

  it('treats RETIRED as terminal', () => {
    // A retired osId still appears in historical audit records. Reviving it
    // would make that history ambiguous.
    for (const status of Object.values(OsStatus)) {
      assert.equal(
        canTransitionOsStatus(OsStatus.Retired, status),
        false,
        `RETIRED must not transition to ${status}`,
      );
    }
  });

  it('allows suspension and reinstatement for incident response', () => {
    assert.equal(canTransitionOsStatus(OsStatus.Active, OsStatus.Suspended), true);
    assert.equal(canTransitionOsStatus(OsStatus.Suspended, OsStatus.Active), true);
  });

  it('allows retirement from any live state', () => {
    for (const status of [
      OsStatus.Registered,
      OsStatus.Configuring,
      OsStatus.SecurityValidation,
      OsStatus.Active,
      OsStatus.Suspended,
    ]) {
      assert.equal(canTransitionOsStatus(status, OsStatus.Retired), true);
    }
  });
});

describe('OS attachment slots', () => {
  it('attaches a sector OS beneath a Sector LLC, where BEYU OS stops', () => {
    assert.equal(requiredParentTypeForOs(OsAttachmentKind.SectorOs), 'SECTOR_LLC');
  });

  it('attaches FOUNDATION OS beneath the Foundation, not the holding company', () => {
    // BEYU FOUNDATION is a sister organization to BEYU HOLDING COMPANY.
    // Attaching FOUNDATION OS anywhere under the holding company would
    // re-parent the Foundation by implication.
    assert.equal(requiredParentTypeForOs(OsAttachmentKind.FoundationOs), 'FOUNDATION');
  });

  it('gives the core OS no attachment point', () => {
    assert.equal(requiredParentTypeForOs(OsAttachmentKind.Core), null);
  });
});
