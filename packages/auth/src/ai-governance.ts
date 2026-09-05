/**
 * BEYU OS — AI action governance (spec §51, §54, §55, §56, §90).
 *
 * Hard separation between AI RECOMMENDATION and AI EXECUTION.
 * Noelia and HIVE:
 *   - never bypass authorization,
 *   - never access data except through authorized domain tools,
 *   - never execute material financial/governance/ownership actions alone.
 *
 * Every AI-proposed action passes through `governAiAction` which either
 * permits a low-impact read, or converts the request into a recommendation
 * that requires named human approval.
 */

import {
  type AccessRequest,
  Action,
  type AuthorizationDecision,
  ResourceType,
  type SecurityContext,
} from '@beyu/types';
import { authorize, MATERIAL_RESOURCES } from './policy-engine';

/** Whether an AI action may proceed, and under what conditions. */
export enum AiActionVerdict {
  /** Permitted — the AI may perform this directly (read-only, in-scope). */
  Permitted = 'PERMITTED',
  /** Allowed only as a recommendation requiring human approval. */
  RequiresHumanApproval = 'REQUIRES_HUMAN_APPROVAL',
  /** Blocked outright. */
  Denied = 'DENIED',
}

export interface AiActionRequest extends AccessRequest {
  /** Which AI surface is requesting: Noelia session or a HIVE agent. */
  agent: 'NOELIA' | 'HIVE';
  agentId: string;
  /** The user on whose behalf the AI is acting. AI never acts without a principal. */
  onBehalfOfUserId: string;
  /** Natural-language justification, recorded for explainability. */
  rationale?: string;
}

export interface AiActionGovernanceResult {
  verdict: AiActionVerdict;
  reason: string;
  /** The underlying authorization decision, always evaluated. */
  authorization: AuthorizationDecision;
  /** Roles that may approve, when human approval is required. */
  approverRolesRequired?: string[];
  /** True when the action was downgraded from execution to recommendation. */
  downgradedToRecommendation: boolean;
}

/**
 * Actions AI may never perform under any circumstances, regardless of the
 * permissions held by the human principal (spec §54).
 */
export const AI_FORBIDDEN: ReadonlyArray<{ resource: ResourceType; action: Action }> = [
  // AI can never change who can do what.
  { resource: ResourceType.User, action: Action.Manage },
  { resource: ResourceType.User, action: Action.Delete },
  // AI can never mutate the audit trail.
  { resource: ResourceType.Audit, action: Action.Create },
  { resource: ResourceType.Audit, action: Action.Update },
  { resource: ResourceType.Audit, action: Action.Delete },
  // AI can never execute financial movements.
  { resource: ResourceType.Capital, action: Action.Execute },
  { resource: ResourceType.Waterfall, action: Action.Execute },
  // AI can never self-approve.
  { resource: ResourceType.Capital, action: Action.Approve },
  { resource: ResourceType.Waterfall, action: Action.Approve },
  { resource: ResourceType.Governance, action: Action.Approve },
  { resource: ResourceType.Ownership, action: Action.Approve },
  { resource: ResourceType.Compliance, action: Action.Approve },
  { resource: ResourceType.Document, action: Action.Approve },
  // AI can never alter integration trust configuration.
  { resource: ResourceType.Integration, action: Action.Manage },
];

/** Read-like actions that AI may perform directly when authorized. */
const AI_SAFE_ACTIONS: readonly Action[] = [Action.Read, Action.Export] as const;

/**
 * Governs an AI-initiated action.
 *
 * The AI's effective permissions are exactly those of the human principal it
 * acts for — never broader. It cannot escalate.
 */
export function governAiAction(
  context: SecurityContext,
  request: AiActionRequest,
): AiActionGovernanceResult {
  // The AI must be acting for the authenticated principal; no impersonation.
  if (request.onBehalfOfUserId !== context.userId) {
    const denial: AuthorizationDecision = {
      allowed: false,
      reason:
        'AI agent attempted to act on behalf of a principal other than the ' +
        'authenticated user. Impersonation is not permitted.',
    };
    return {
      verdict: AiActionVerdict.Denied,
      reason: denial.reason,
      authorization: denial,
      downgradedToRecommendation: false,
    };
  }

  // Absolute prohibitions come before any permission evaluation.
  const forbidden = AI_FORBIDDEN.some(
    (f) => f.resource === request.resource && f.action === request.action,
  );
  if (forbidden) {
    const denial: AuthorizationDecision = {
      allowed: false,
      reason:
        `AI agents may never perform "${request.action}" on "${request.resource}". ` +
        'This action is reserved for human principals.',
    };
    return {
      verdict: AiActionVerdict.Denied,
      reason: denial.reason,
      authorization: denial,
      downgradedToRecommendation: false,
    };
  }

  // The AI inherits — and is bounded by — the human's authorization.
  const decision = authorize(context, request);
  if (!decision.allowed) {
    return {
      verdict: AiActionVerdict.Denied,
      reason: `Underlying principal is not authorized: ${decision.reason}`,
      authorization: decision,
      downgradedToRecommendation: false,
    };
  }

  // Read-only work inside scope proceeds directly.
  if (AI_SAFE_ACTIONS.includes(request.action as Action)) {
    return {
      verdict: AiActionVerdict.Permitted,
      reason: 'Read-only action within the principal\u2019s authorized scope.',
      authorization: decision,
      downgradedToRecommendation: false,
    };
  }

  // Any mutation of a material domain becomes a recommendation.
  if (MATERIAL_RESOURCES.includes(request.resource)) {
    return {
      verdict: AiActionVerdict.RequiresHumanApproval,
      reason:
        `Mutating "${request.resource}" is a material action. The AI output is ` +
        'recorded as a recommendation and requires human review and approval ' +
        'before execution.',
      authorization: decision,
      approverRolesRequired: approverRolesFor(request.resource),
      downgradedToRecommendation: true,
    };
  }

  // Non-material mutations still require human confirmation by default.
  return {
    verdict: AiActionVerdict.RequiresHumanApproval,
    reason:
      'AI-initiated state changes require human confirmation. Separation of ' +
      'recommendation from execution is enforced system-wide.',
    authorization: decision,
    approverRolesRequired: approverRolesFor(request.resource),
    downgradedToRecommendation: true,
  };
}

function approverRolesFor(resource: ResourceType): string[] {
  switch (resource) {
    case ResourceType.Capital:
    case ResourceType.Waterfall:
      return ['TRUST_ADMINISTRATOR', 'TRUSTEE', 'CAPITAL_CONTROLLER'];
    case ResourceType.Ownership:
      return ['TRUST_ADMINISTRATOR', 'TRUSTEE'];
    case ResourceType.Governance:
      return ['TRUST_ADMINISTRATOR', 'BOARD_DIRECTOR', 'GOVERNANCE_SECRETARY'];
    case ResourceType.Compliance:
      return ['COMPLIANCE_OFFICER', 'TRUST_ADMINISTRATOR'];
    case ResourceType.Organization:
      return ['TRUST_ADMINISTRATOR'];
    default:
      return ['TRUST_ADMINISTRATOR', 'GROUP_EXECUTIVE'];
  }
}

/**
 * Redacts a tool result before it reaches the language model, enforcing data
 * minimization (spec §60, §68). Fields not explicitly allowed are dropped.
 */
export function minimizeForAi<T extends Record<string, unknown>>(
  record: T,
  allowedFields: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const field of allowedFields) {
    if (field in record) {
      (out as Record<string, unknown>)[field] = record[field];
    }
  }
  return out;
}
