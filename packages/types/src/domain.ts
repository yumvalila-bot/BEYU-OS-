/**
 * BEYU OS — Core domain types across governance, ownership, strategy, risk,
 * compliance, capital, documents, workflow and the OS registry.
 */

import { type OsId } from './authorization';

/* ------------------------------------------------------------------ */
/* Ownership (spec §22)                                                */
/* ------------------------------------------------------------------ */

export enum LegalEntityType {
  Trust = 'TRUST',
  Corporation = 'CORPORATION',
  LimitedLiabilityCompany = 'LLC',
  Foundation = 'FOUNDATION',
  Partnership = 'PARTNERSHIP',
  NaturalPerson = 'NATURAL_PERSON',
}

export interface LegalEntity {
  id: string;
  name: string;
  entityType: LegalEntityType;
  registrationNumber?: string | null;
  jurisdictionCountry: string;
  incorporationDate?: string | null;
  orgNodeId?: string | null;
  status: 'ACTIVE' | 'DORMANT' | 'DISSOLVED';
}

export interface ShareClass {
  id: string;
  entityId: string;
  name: string;
  votingRightsPerShare: number;
  /** Basis points of economic entitlement per share, if applicable. */
  economicRightsBps?: number | null;
  authorizedShares?: number | null;
  issuedShares?: number | null;
}

/**
 * An ownership interest. Percentages are stored in BASIS POINTS as integers.
 * Never hard-coded — always sourced from the database (spec §22, §86.39).
 */
export interface OwnershipInterest {
  id: string;
  /** The entity that is owned. */
  ownedEntityId: string;
  /** The owning entity or natural person. */
  ownerEntityId: string;
  shareClassId?: string | null;
  /** Ownership in basis points (10000 bps = 100%). */
  percentageBps: number;
  shares?: number | null;
  /** Capital contributed, in minor units. */
  capitalContributionMinor?: number | null;
  currency?: string | null;
  effectiveFrom: string;
  /** Null while current. Set when superseded — history is never deleted. */
  effectiveTo: string | null;
  isBeneficialOwner: boolean;
  createdAt: string;
  supersededByChangeId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Governance (spec §23)                                               */
/* ------------------------------------------------------------------ */

export enum GovernanceBodyType {
  Board = 'BOARD',
  Committee = 'COMMITTEE',
  TrusteeCouncil = 'TRUSTEE_COUNCIL',
}

export enum MeetingStatus {
  Scheduled = 'SCHEDULED',
  InProgress = 'IN_PROGRESS',
  Held = 'HELD',
  Cancelled = 'CANCELLED',
}

export enum ResolutionStatus {
  Draft = 'DRAFT',
  Proposed = 'PROPOSED',
  Voting = 'VOTING',
  Carried = 'CARRIED',
  Defeated = 'DEFEATED',
  Withdrawn = 'WITHDRAWN',
}

export enum VoteChoice {
  For = 'FOR',
  Against = 'AGAINST',
  Abstain = 'ABSTAIN',
  Recused = 'RECUSED',
}

export interface GovernanceBody {
  id: string;
  name: string;
  bodyType: GovernanceBodyType;
  orgNodeId: string;
  charterDocumentId?: string | null;
  /** Minimum members required for a valid vote. */
  quorum: number;
  status: 'ACTIVE' | 'DISSOLVED';
}

export interface Resolution {
  id: string;
  bodyId: string;
  meetingId?: string | null;
  reference: string;
  title: string;
  description: string;
  status: ResolutionStatus;
  proposedBy: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  decidedAt?: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Strategy (spec §24)                                                 */
/* ------------------------------------------------------------------ */

export interface StrategicPlan {
  id: string;
  name: string;
  orgNodeId: string;
  horizonStart: string;
  horizonEnd: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}

export interface Objective {
  id: string;
  planId: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  /** Progress in basis points (10000 = 100%). */
  progressBps: number;
  status: 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'ACHIEVED';
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  /** Values stored as numeric strings to avoid float drift on aggregates. */
  targetValue: string;
  currentValue: string;
  unit: string;
  dueDate?: string | null;
}

export interface Kpi {
  id: string;
  name: string;
  orgNodeId: string;
  unit: string;
  targetValue?: string | null;
  currentValue?: string | null;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  /** Sector OS that supplied the value, when sourced cross-OS. */
  sourceOsId?: OsId | null;
  periodEnd?: string | null;
}

/* ------------------------------------------------------------------ */
/* Risk (spec §25)                                                     */
/* ------------------------------------------------------------------ */

export enum RiskCategory {
  Enterprise = 'ENTERPRISE',
  Strategic = 'STRATEGIC',
  Financial = 'FINANCIAL',
  Operational = 'OPERATIONAL',
  Cyber = 'CYBER',
  Compliance = 'COMPLIANCE',
  Country = 'COUNTRY',
  Sector = 'SECTOR',
}

export enum RiskStatus {
  Identified = 'IDENTIFIED',
  Assessed = 'ASSESSED',
  Assigned = 'ASSIGNED',
  Mitigation = 'MITIGATION',
  Monitoring = 'MONITORING',
  Resolved = 'RESOLVED',
  Accepted = 'ACCEPTED',
  Transferred = 'TRANSFERRED',
}

/** Valid risk lifecycle transitions (spec §25). */
export const RISK_TRANSITIONS: Record<RiskStatus, readonly RiskStatus[]> = {
  [RiskStatus.Identified]: [RiskStatus.Assessed],
  [RiskStatus.Assessed]: [RiskStatus.Assigned, RiskStatus.Accepted, RiskStatus.Transferred],
  [RiskStatus.Assigned]: [RiskStatus.Mitigation, RiskStatus.Accepted, RiskStatus.Transferred],
  [RiskStatus.Mitigation]: [RiskStatus.Monitoring, RiskStatus.Resolved],
  [RiskStatus.Monitoring]: [RiskStatus.Resolved, RiskStatus.Mitigation, RiskStatus.Accepted],
  [RiskStatus.Resolved]: [],
  [RiskStatus.Accepted]: [RiskStatus.Monitoring],
  [RiskStatus.Transferred]: [RiskStatus.Monitoring],
};

export interface Risk {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: RiskCategory;
  status: RiskStatus;
  orgNodeId: string;
  countryCode?: string | null;
  ownerUserId?: string | null;
  /** 1-5 scale. */
  likelihood: number;
  /** 1-5 scale. */
  impact: number;
  /** likelihood * impact, 1-25. Computed, never client-supplied. */
  inherentScore: number;
  residualScore?: number | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Compliance (spec §26, §65)                                          */
/* ------------------------------------------------------------------ */

export interface ComplianceFramework {
  id: string;
  code: string;
  name: string;
  /** Null = globally applicable. Country regulations are never hard-coded. */
  countryCode: string | null;
  sectorCode: string | null;
  version: string;
  authority?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DRAFT';
}

export interface ComplianceRequirement {
  id: string;
  frameworkId: string;
  reference: string;
  title: string;
  description?: string | null;
  mandatory: boolean;
}

export interface ComplianceControl {
  id: string;
  requirementId: string;
  name: string;
  controlType: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
  ownerUserId?: string | null;
  frequency?: string | null;
  status: 'EFFECTIVE' | 'PARTIAL' | 'INEFFECTIVE' | 'NOT_ASSESSED';
}

/* ------------------------------------------------------------------ */
/* Capital (spec §27)                                                  */
/* ------------------------------------------------------------------ */

export enum CapitalPoolType {
  Reserve = 'RESERVE',
  Growth = 'GROWTH',
  Strategic = 'STRATEGIC',
  Acquisition = 'ACQUISITION',
  Emergency = 'EMERGENCY',
  FoundationAllocation = 'FOUNDATION_ALLOCATION',
  WorkingCapital = 'WORKING_CAPITAL',
}

export interface CapitalPool {
  id: string;
  name: string;
  poolType: CapitalPoolType;
  entityId: string;
  currency: string;
  /** Balance in minor units. */
  balanceMinor: number;
  targetMinor?: number | null;
  status: 'ACTIVE' | 'CLOSED';
}

export interface CapitalAllocation {
  id: string;
  sourcePoolId: string | null;
  destinationEntityId: string;
  destinationPoolId?: string | null;
  amountMinor: number;
  currency: string;
  purpose: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'RELEASED' | 'CANCELLED';
  /** Set when the allocation originated from a waterfall calculation. */
  waterfallCalculationId?: string | null;
  requestedBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* OS Registry (spec §4, §71)                                          */
/* ------------------------------------------------------------------ */

/*
 * OS registration types live in `os-registry.ts`, which is the single source
 * of truth for the federation seam: lifecycle, capability grants and the
 * deny list. They were previously declared here as well; two definitions of
 * the same concept is how they drift apart.
 */

/* ------------------------------------------------------------------ */
/* Documents & Workflow (spec §35, §36)                                */
/* ------------------------------------------------------------------ */

export enum DocumentStatus {
  Draft = 'DRAFT',
  PendingApproval = 'PENDING_APPROVAL',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  Archived = 'ARCHIVED',
}

export interface DocumentRecord {
  id: string;
  title: string;
  documentType: string;
  status: DocumentStatus;
  tenantId: string | null;
  orgNodeId: string | null;
  classification: string;
  currentVersion: number;
  /** Object storage key. Files never live in PostgreSQL. */
  storageKey: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  retentionPolicyId?: string | null;
  legalHold: boolean;
  createdBy: string;
  createdAt: string;
}

export enum WorkflowInstanceStatus {
  Running = 'RUNNING',
  Completed = 'COMPLETED',
  Rejected = 'REJECTED',
  Cancelled = 'CANCELLED',
  Escalated = 'ESCALATED',
}

export enum TaskStatus {
  Pending = 'PENDING',
  InProgress = 'IN_PROGRESS',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  Delegated = 'DELEGATED',
  Escalated = 'ESCALATED',
  Cancelled = 'CANCELLED',
}

export interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
  version: number;
  /** Sequential or parallel approval steps. */
  steps: WorkflowStepDefinition[];
  active: boolean;
}

export interface WorkflowStepDefinition {
  order: number;
  name: string;
  /** Roles permitted to action this step. */
  approverRoles: string[];
  mode: 'SEQUENTIAL' | 'PARALLEL';
  /** Number of approvals required when mode is PARALLEL. */
  requiredApprovals: number;
  slaHours?: number | null;
  escalationRole?: string | null;
}
