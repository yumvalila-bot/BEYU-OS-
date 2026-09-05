/**
 * BEYU OS — Versioned event contracts (spec §42, §63).
 * Events are versioned, tenant-aware, auditable and idempotent where
 * appropriate. Consumers must tolerate unknown fields (forward compatibility).
 */

export enum BeyuEventType {
  TenantCreated = 'beyu.tenant.created',
  OrganizationCreated = 'beyu.organization.created',
  SectorRegistered = 'beyu.sector.registered',
  OsRegistered = 'beyu.os.registered',
  GovernanceDecisionApproved = 'beyu.governance.decision.approved',
  RiskCreated = 'beyu.risk.created',
  ComplianceIssueDetected = 'beyu.compliance.issue.detected',
  CapitalAllocated = 'beyu.capital.allocated',
  WaterfallCalculated = 'beyu.waterfall.calculated',
  WaterfallApproved = 'beyu.waterfall.approved',
  FoundationAllocationApproved = 'beyu.foundation.allocation.approved',
  DocumentApproved = 'beyu.document.approved',
  UserInvited = 'beyu.user.invited',
  AiInsightGenerated = 'beyu.ai.insight.generated',
}

/** Envelope wrapping every published event. */
export interface BeyuEvent<TPayload = unknown> {
  /** Unique event id — consumers use this for idempotency. */
  id: string;
  type: BeyuEventType | string;
  /** Contract version of the payload, e.g. "1.0". */
  version: string;
  /** Emitting OS. */
  source: string;
  tenantId: string | null;
  organizationId: string | null;
  /** Correlates events produced by one logical operation. */
  correlationId: string | null;
  causationId: string | null;
  actorUserId: string | null;
  occurredAt: string;
  payload: TPayload;
}

export interface WaterfallCalculatedPayload {
  calculationId: string;
  ruleSetId: string;
  ruleSetVersion: string;
  periodId: string;
  currency: string;
  inflowMinor: number;
  totalAllocatedMinor: number;
}

export interface CapitalAllocatedPayload {
  allocationId: string;
  destinationEntityId: string;
  amountMinor: number;
  currency: string;
  purpose: string;
}

export interface OsRegisteredPayload {
  osId: string;
  name: string;
  sectorCode: string | null;
  version: string;
}

export interface RiskCreatedPayload {
  riskId: string;
  reference: string;
  category: string;
  inherentScore: number;
}
