/**
 * AI governance tests (spec §54, §60, §68).
 *
 * Two properties matter most and are asserted exhaustively below:
 *   1. AI can never exceed the human principal it acts for.
 *   2. AI recommends; humans execute. No mutation is ever auto-applied.
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
  AiActionVerdict,
  AI_FORBIDDEN,
  governAiAction,
  minimizeForAi,
  type AiActionRequest,
} from './ai-governance';
import { permissionsForRoles } from './policy-engine';

function context(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return {
    userId: 'user-1',
    identityId: 'identity-1',
    email: 'user@beyu.test',
    displayName: 'Test User',
    roles: [Role.TrustAdministrator],
    permissions: permissionsForRoles([Role.TrustAdministrator]),
    tenantIds: ['tenant-1'],
    activeTenantId: 'tenant-1',
    organizationIds: ['org-1'],
    osIds: [OsId.BeyuOs],
    countryCodes: ['TZ'],
    maxClassification: DataClassification.Restricted,
    mfaSatisfied: true,
    isServiceAccount: false,
    requestId: 'req-1',
    issuedAt: Date.now() - 1000,
    expiresAt: Date.now() + 3_600_000,
    ...overrides,
  };
}

function aiRequest(overrides: Partial<AiActionRequest> = {}): AiActionRequest {
  return {
    agent: 'NOELIA',
    agentId: 'noelia-1',
    onBehalfOfUserId: 'user-1',
    resource: ResourceType.Strategy,
    action: Action.Read,
    ...overrides,
  };
}

describe('governAiAction — impersonation', () => {
  it('denies acting on behalf of anyone but the authenticated principal', () => {
    const result = governAiAction(context(), aiRequest({ onBehalfOfUserId: 'someone-else' }));
    assert.equal(result.verdict, AiActionVerdict.Denied);
    assert.match(result.reason, /impersonation/i);
  });
});

describe('governAiAction — absolute prohibitions', () => {
  it('denies every forbidden pair even for an all-powerful principal', () => {
    // The trust administrator holds the broadest permission set in the system;
    // the AI acting for them still cannot perform these actions.
    for (const forbidden of AI_FORBIDDEN) {
      const result = governAiAction(
        context(),
        aiRequest({ resource: forbidden.resource, action: forbidden.action }),
      );
      assert.equal(
        result.verdict,
        AiActionVerdict.Denied,
        `${forbidden.action} on ${forbidden.resource} must be denied`,
      );
      assert.equal(result.downgradedToRecommendation, false);
    }
  });

  it('never lets AI execute capital movements or approve its own proposals', () => {
    const execute = governAiAction(
      context(),
      aiRequest({ resource: ResourceType.Capital, action: Action.Execute }),
    );
    assert.equal(execute.verdict, AiActionVerdict.Denied);

    const approve = governAiAction(
      context(),
      aiRequest({ resource: ResourceType.Waterfall, action: Action.Approve }),
    );
    assert.equal(approve.verdict, AiActionVerdict.Denied);
  });
});

describe('governAiAction — bounded by the human principal', () => {
  it('denies what the underlying human cannot do', () => {
    const weak = context({
      roles: [Role.ReadOnly],
      permissions: permissionsForRoles([Role.ReadOnly]),
    });
    const result = governAiAction(
      weak,
      aiRequest({ resource: ResourceType.Capital, action: Action.Update }),
    );
    assert.equal(result.verdict, AiActionVerdict.Denied);
    assert.match(result.reason, /not authorized/i);
  });

  it('cannot escape the tenant boundary of its principal', () => {
    const scoped = context({
      roles: [Role.TenantUser],
      permissions: [{ resource: ResourceType.Document, action: Action.Read } as Permission],
      tenantIds: ['tenant-1'],
    });
    const result = governAiAction(
      scoped,
      aiRequest({ resource: ResourceType.Document, action: Action.Read, tenantId: 'tenant-999' }),
    );
    assert.equal(result.verdict, AiActionVerdict.Denied);
  });

  it('cannot read sector-sensitive data through BEYU OS', () => {
    const result = governAiAction(
      context({ maxClassification: DataClassification.SectorSensitive }),
      aiRequest({
        resource: ResourceType.Strategy,
        action: Action.Read,
        classification: DataClassification.SectorSensitive,
      }),
    );
    assert.equal(result.verdict, AiActionVerdict.Denied);
  });
});

describe('governAiAction — recommendation, not execution', () => {
  it('permits in-scope read and export directly', () => {
    for (const action of [Action.Read, Action.Export]) {
      const result = governAiAction(context(), aiRequest({ action }));
      assert.equal(result.verdict, AiActionVerdict.Permitted);
      assert.equal(result.downgradedToRecommendation, false);
    }
  });

  it('downgrades every authorized mutation to a recommendation', () => {
    const mutations = [Action.Create, Action.Update, Action.Delete];
    const resources = [
      ResourceType.Strategy,
      ResourceType.Risk,
      ResourceType.Capital,
      ResourceType.Ownership,
      ResourceType.Document,
      ResourceType.Workflow,
    ];

    for (const resource of resources) {
      for (const action of mutations) {
        const result = governAiAction(context(), aiRequest({ resource, action }));
        if (result.verdict === AiActionVerdict.Denied) continue; // forbidden pairs
        assert.equal(
          result.verdict,
          AiActionVerdict.RequiresHumanApproval,
          `${action} on ${resource} must require approval`,
        );
        assert.equal(result.downgradedToRecommendation, true);
        assert.ok(
          (result.approverRolesRequired?.length ?? 0) > 0,
          `${action} on ${resource} must name an approver role`,
        );
      }
    }
  });

  it('never returns Permitted for any mutating action, on any resource', () => {
    // Exhaustive sweep: the separation of recommendation from execution must
    // hold across the entire resource matrix, not just the ones we thought of.
    for (const resource of Object.values(ResourceType)) {
      for (const action of [Action.Create, Action.Update, Action.Delete, Action.Execute, Action.Approve, Action.Manage]) {
        const result = governAiAction(context(), aiRequest({ resource, action }));
        assert.notEqual(
          result.verdict,
          AiActionVerdict.Permitted,
          `AI must never be permitted to ${action} ${resource} without human approval`,
        );
      }
    }
  });

  it('routes capital recommendations to capital approvers', () => {
    const result = governAiAction(
      context(),
      aiRequest({ resource: ResourceType.Capital, action: Action.Create }),
    );
    assert.equal(result.verdict, AiActionVerdict.RequiresHumanApproval);
    assert.ok(result.approverRolesRequired?.includes('CAPITAL_CONTROLLER'));
  });
});

describe('minimizeForAi', () => {
  it('keeps only explicitly allowed fields', () => {
    const record = {
      id: 'doc-1',
      title: 'Board pack',
      nationalId: '1234567890',
      bankAccount: 'ACC-999',
    };
    const minimized = minimizeForAi(record, ['id', 'title']);
    assert.deepEqual(minimized, { id: 'doc-1', title: 'Board pack' });
    assert.ok(!('nationalId' in minimized), 'PII must not reach the model');
    assert.ok(!('bankAccount' in minimized));
  });

  it('ignores allowed fields that are absent rather than inventing them', () => {
    assert.deepEqual(minimizeForAi({ id: 'x' }, ['id', 'missing']), { id: 'x' });
  });
});
