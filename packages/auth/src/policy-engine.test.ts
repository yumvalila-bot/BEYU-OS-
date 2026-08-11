/**
 * Policy engine tests (spec §50-§57).
 *
 * The authorization layer is the only thing standing between a request and the
 * data. These tests assert the deny-by-default posture and each boundary in
 * turn: session validity, MFA step-up, OS boundary, tenant boundary,
 * classification ceiling, then RBAC/ABAC.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  Action,
  DataClassification,
  OsId,
  ResourceType,
  Role,
  type Permission,
  type SecurityContext,
} from '@beyu/types';

import {
  assertAuthorized,
  authorize,
  hasRole,
  HIGH_IMPACT_ACTIONS,
  permissionsForRoles,
  ROLE_PERMISSIONS,
} from './policy-engine';

function context(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return {
    userId: 'user-1',
    identityId: 'identity-1',
    email: 'user@beyu.test',
    displayName: 'Test User',
    roles: [Role.TenantUser],
    permissions: [],
    tenantIds: ['tenant-1'],
    activeTenantId: 'tenant-1',
    organizationIds: ['org-1'],
    osIds: [OsId.BeyuOs],
    countryCodes: ['TZ'],
    maxClassification: DataClassification.Confidential,
    mfaSatisfied: true,
    isServiceAccount: false,
    requestId: 'req-1',
    issuedAt: Date.now() - 1000,
    expiresAt: Date.now() + 3_600_000,
    ...overrides,
  };
}

const READ_STRATEGY: Permission = { resource: ResourceType.Strategy, action: Action.Read };

describe('authorize — deny by default', () => {
  it('denies when the principal holds no permissions at all', () => {
    const decision = authorize(context(), {
      resource: ResourceType.Strategy,
      action: Action.Read,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /No permission grants/);
  });

  it('denies an unauthenticated principal', () => {
    const decision = authorize(context({ userId: '', permissions: [READ_STRATEGY] }), {
      resource: ResourceType.Strategy,
      action: Action.Read,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /No authenticated principal/);
  });

  it('denies an expired security context', () => {
    const decision = authorize(
      context({ expiresAt: Date.now() - 1, permissions: [READ_STRATEGY] }),
      { resource: ResourceType.Strategy, action: Action.Read },
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /expired/i);
  });

  it('allows when a matching permission exists', () => {
    const decision = authorize(context({ permissions: [READ_STRATEGY] }), {
      resource: ResourceType.Strategy,
      action: Action.Read,
    });
    assert.equal(decision.allowed, true);
    assert.ok(decision.obligations?.includes('AUDIT'), 'every allow must oblige an audit record');
  });

  it('treats Manage as covering other actions on the same resource', () => {
    const decision = authorize(
      context({ permissions: [{ resource: ResourceType.Strategy, action: Action.Manage }] }),
      { resource: ResourceType.Strategy, action: Action.Update },
    );
    assert.equal(decision.allowed, true);
  });

  it('never lets a permission for one resource leak to another', () => {
    const decision = authorize(context({ permissions: [READ_STRATEGY] }), {
      resource: ResourceType.Ownership,
      action: Action.Read,
    });
    assert.equal(decision.allowed, false);
  });
});

describe('authorize — MFA step-up', () => {
  for (const action of HIGH_IMPACT_ACTIONS) {
    it(`requires MFA for high-impact action "${action}"`, () => {
      const ctx = context({
        mfaSatisfied: false,
        permissions: [{ resource: ResourceType.Capital, action: Action.Manage }],
      });
      const decision = authorize(ctx, { resource: ResourceType.Capital, action });
      assert.equal(decision.allowed, false);
      assert.match(decision.reason, /multi-factor/i);
    });
  }

  it('exempts service accounts, which authenticate by credential not MFA', () => {
    const ctx = context({
      mfaSatisfied: false,
      isServiceAccount: true,
      permissions: [{ resource: ResourceType.Capital, action: Action.Manage }],
    });
    const decision = authorize(ctx, {
      resource: ResourceType.Capital,
      action: HIGH_IMPACT_ACTIONS[0],
    });
    assert.equal(decision.allowed, true);
  });
});

describe('authorize — OS boundary', () => {
  it('denies reaching an OS the principal is not provisioned for', () => {
    const ctx = context({
      permissions: [{ resource: ResourceType.Capital, action: Action.Read }],
    });
    const decision = authorize(ctx, {
      resource: ResourceType.Capital,
      action: Action.Read,
      osId: OsId.FinanceOs,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /not authorized for FINANCE_OS/);
  });

  it('does not treat a shared identity as cross-OS access', () => {
    // Same human, same identityId, but only provisioned for BEYU OS.
    const ctx = context({
      osIds: [OsId.BeyuOs],
      permissions: [{ resource: ResourceType.Strategy, action: Action.Read }],
    });
    assert.equal(
      authorize(ctx, {
        resource: ResourceType.Strategy,
        action: Action.Read,
        osId: OsId.HealthOs,
      }).allowed,
      false,
    );
  });
});

describe('authorize — tenant boundary', () => {
  it('denies access to a tenant the principal does not belong to', () => {
    const ctx = context({ permissions: [READ_STRATEGY] });
    const decision = authorize(ctx, {
      resource: ResourceType.Strategy,
      action: Action.Read,
      tenantId: 'tenant-999',
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /no membership in tenant/i);
  });

  it('permits trust administrators and auditors across tenants', () => {
    for (const role of [Role.TrustAdministrator, Role.Auditor]) {
      const ctx = context({ roles: [role], permissions: [READ_STRATEGY] });
      const decision = authorize(ctx, {
        resource: ResourceType.Strategy,
        action: Action.Read,
        tenantId: 'tenant-999',
      });
      assert.equal(decision.allowed, true, `${role} should cross tenants`);
    }
  });
});

describe('authorize — data classification', () => {
  it('denies records above the principal clearance', () => {
    const ctx = context({
      maxClassification: DataClassification.Internal,
      permissions: [READ_STRATEGY],
    });
    const decision = authorize(ctx, {
      resource: ResourceType.Strategy,
      action: Action.Read,
      classification: DataClassification.Restricted,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /exceeds the principal/i);
  });

  it('never exposes sector-sensitive data through BEYU OS, even to the trust administrator', () => {
    // This is the OS-boundary rule that keeps sector operations out of the
    // control plane. It must not be overridable by role.
    const ctx = context({
      roles: [Role.TrustAdministrator],
      maxClassification: DataClassification.SectorSensitive,
      permissions: [{ resource: ResourceType.Strategy, action: Action.Manage }],
    });
    const decision = authorize(ctx, {
      resource: ResourceType.Strategy,
      action: Action.Read,
      classification: DataClassification.SectorSensitive,
      osId: OsId.BeyuOs,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /Sector-sensitive/i);
  });
});

describe('authorize — ABAC constraints narrow, never widen', () => {
  it('enforces country constraints', () => {
    const ctx = context({
      permissions: [
        { resource: ResourceType.Strategy, action: Action.Read, constraints: { countryCodes: ['TZ'] } },
      ],
    });
    assert.equal(
      authorize(ctx, { resource: ResourceType.Strategy, action: Action.Read, countryCode: 'TZ' })
        .allowed,
      true,
    );
    assert.equal(
      authorize(ctx, { resource: ResourceType.Strategy, action: Action.Read, countryCode: 'KE' })
        .allowed,
      false,
    );
    // An unspecified attribute cannot satisfy a constraint that requires it.
    assert.equal(
      authorize(ctx, { resource: ResourceType.Strategy, action: Action.Read }).allowed,
      false,
    );
  });

  it('enforces ownRecordsOnly', () => {
    const ctx = context({
      permissions: [
        { resource: ResourceType.Document, action: Action.Read, constraints: { ownRecordsOnly: true } },
      ],
    });
    assert.equal(
      authorize(ctx, {
        resource: ResourceType.Document,
        action: Action.Read,
        ownerUserId: 'user-1',
      }).allowed,
      true,
    );
    assert.equal(
      authorize(ctx, {
        resource: ResourceType.Document,
        action: Action.Read,
        ownerUserId: 'user-2',
      }).allowed,
      false,
    );
  });

  it('allows a broader grant to succeed when a narrower one fails', () => {
    const ctx = context({
      permissions: [
        { resource: ResourceType.Strategy, action: Action.Read, constraints: { countryCodes: ['KE'] } },
        { resource: ResourceType.Strategy, action: Action.Read },
      ],
    });
    assert.equal(
      authorize(ctx, { resource: ResourceType.Strategy, action: Action.Read, countryCode: 'TZ' })
        .allowed,
      true,
    );
  });
});

describe('obligations', () => {
  it('requires human approval for mutations of material resources', () => {
    const ctx = context({
      permissions: [{ resource: ResourceType.Capital, action: Action.Manage }],
    });
    const decision = authorize(ctx, { resource: ResourceType.Capital, action: Action.Update });
    assert.equal(decision.allowed, true);
    assert.ok(decision.obligations?.includes('REQUIRE_HUMAN_APPROVAL'));
  });

  it('does not require approval for merely reading a material resource', () => {
    const ctx = context({
      permissions: [{ resource: ResourceType.Capital, action: Action.Read }],
    });
    const decision = authorize(ctx, { resource: ResourceType.Capital, action: Action.Read });
    assert.ok(!decision.obligations?.includes('REQUIRE_HUMAN_APPROVAL'));
  });

  it('applies data minimization on export', () => {
    const ctx = context({
      permissions: [{ resource: ResourceType.Report, action: Action.Export }],
    });
    const decision = authorize(ctx, { resource: ResourceType.Report, action: Action.Export });
    assert.ok(decision.obligations?.includes('APPLY_DATA_MINIMIZATION'));
  });
});

describe('roles', () => {
  it('defines permissions for every declared role', () => {
    for (const role of Object.values(Role)) {
      assert.ok(ROLE_PERMISSIONS[role], `role ${role} has no permission mapping`);
    }
  });

  it('grants READ_ONLY no mutating permission anywhere', () => {
    const mutations = [Action.Create, Action.Update, Action.Delete, Action.Manage, Action.Execute];
    for (const permission of ROLE_PERMISSIONS[Role.ReadOnly]) {
      assert.ok(
        !mutations.includes(permission.action),
        `READ_ONLY must not grant ${permission.action} on ${permission.resource}`,
      );
    }
  });

  it('never grants any role the ability to update or delete audit records', () => {
    // The audit trail is append-only by design; no role may be able to rewrite it.
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of permissions) {
        if (p.resource !== ResourceType.Audit) continue;
        assert.ok(
          ![Action.Update, Action.Delete].includes(p.action),
          `${role} must not hold ${p.action} on audit`,
        );
      }
    }
  });

  it('deduplicates permissions across combined roles', () => {
    const combined = permissionsForRoles([Role.Auditor, Role.ReadOnly]);
    const keys = combined.map((p) => `${p.resource}:${p.action}:${JSON.stringify(p.constraints ?? null)}`);
    assert.equal(keys.length, new Set(keys).size, 'permissionsForRoles returned duplicates');
  });

  it('reports role membership', () => {
    assert.equal(hasRole(context({ roles: [Role.Trustee] }), Role.Trustee), true);
    assert.equal(hasRole(context({ roles: [Role.Trustee] }), Role.Auditor), false);
  });
});

describe('assertAuthorized', () => {
  it('throws on denial and passes on allow', () => {
    const denied = context();
    assert.throws(() =>
      assertAuthorized(denied, { resource: ResourceType.Strategy, action: Action.Read }),
    );

    const allowed = context({ permissions: [READ_STRATEGY] });
    assert.doesNotThrow(() =>
      assertAuthorized(allowed, { resource: ResourceType.Strategy, action: Action.Read }),
    );
  });
});

describe('audit trail is never mutable', () => {
  it('denies audit mutation even when a permission explicitly grants it', () => {
    // Simulates a stale or malicious grant loaded from the database. The
    // decision must not depend on the permission table being well-formed.
    for (const action of [Action.Create, Action.Update, Action.Delete, Action.Manage]) {
      const ctx = context({
        roles: [Role.TrustAdministrator],
        permissions: [{ resource: ResourceType.Audit, action }],
      });
      const decision = authorize(ctx, { resource: ResourceType.Audit, action });
      assert.equal(decision.allowed, false, `audit ${action} must be denied`);
      assert.match(decision.reason, /append-only/i);
    }
  });

  it('still allows reading and exporting audit records', () => {
    const ctx = context({
      roles: [Role.Auditor],
      permissions: permissionsForRoles([Role.Auditor]),
    });
    assert.equal(authorize(ctx, { resource: ResourceType.Audit, action: Action.Read }).allowed, true);
    assert.equal(authorize(ctx, { resource: ResourceType.Audit, action: Action.Export }).allowed, true);
  });
});
