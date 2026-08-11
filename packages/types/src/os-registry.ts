/**
 * Federated OS contracts (spec §4, §69, §70, §71).
 *
 * BEYU OS is the control plane. Health OS, Agriculture OS, Finance OS and
 * FOUNDATION OS are SEPARATE SYSTEMS with their own databases, deployments and
 * teams. They attach to BEYU OS; they are never absorbed into it. BEYU OS ends
 * at the Sector LLC boundary and knows nothing about how a clinic schedules a
 * surgeon or how a farm books a harvest.
 *
 * What this file defines is the seam: how an independent OS registers itself,
 * what it is allowed to ask for, and what it may receive. Three rules shape
 * every type here.
 *
 *  1. ATTACHMENT IS DATA. Onboarding an OS is a registry row and a set of
 *     grants, never a schema migration or a redesign. A tenth OS must cost the
 *     same as the fourth.
 *
 *  2. ISOLATION IS THE DEFAULT. An OS starts with NO capabilities. Everything
 *     it can see is an explicit, audited grant. Health OS cannot read
 *     Agriculture OS's data because nothing ever grants it that, not because
 *     some check remembered to say no.
 *
 *  3. NO SHARED DATABASE, EVER. Sharing happens over versioned REST and
 *     events. There is deliberately no type in this file that describes a
 *     database connection to another OS, because that path must not exist.
 */

/** Lifecycle of an attached OS (spec §71). */
export enum OsStatus {
  /** Known to the registry. No credentials issued, no access. */
  Registered = 'REGISTERED',
  /** Capability grants and contracts being configured. Still no access. */
  Configuring = 'CONFIGURING',
  /** Undergoing security review. Access remains closed until it passes. */
  SecurityValidation = 'SECURITY_VALIDATION',
  /** Live. The only status in which requests are honoured. */
  Active = 'ACTIVE',
  /** Temporarily cut off, e.g. during an incident. Reversible. */
  Suspended = 'SUSPENDED',
  /** Permanently decommissioned. Never reactivated; register a new OS. */
  Retired = 'RETIRED',
}

/**
 * The ONLY status in which an attached OS may call BEYU OS.
 *
 * Written as a single exported constant rather than repeated inline, so the
 * question "when is an OS allowed in?" has exactly one answer in the codebase.
 */
export const OS_ACTIVE_STATUS = OsStatus.Active;

/** Integration wiring state, tracked separately from lifecycle status. */
export enum OsIntegrationStatus {
  NotConfigured = 'NOT_CONFIGURED',
  Configured = 'CONFIGURED',
  Verified = 'VERIFIED',
  Failed = 'FAILED',
}

/** Liveness, as last observed by BEYU OS. */
export enum OsHealthStatus {
  Healthy = 'HEALTHY',
  Degraded = 'DEGRADED',
  Unreachable = 'UNREACHABLE',
  Unknown = 'UNKNOWN',
}

/**
 * Shared core capabilities an attached OS can be granted (spec §69, §70).
 *
 * This enum IS the shared-feature surface. Every entry is a read of control
 * plane state or a request for a control plane decision — never a write to
 * another OS's domain, and never a financial execution.
 *
 * Naming is `DOMAIN_VERB`. The absence of most verbs is the point: there is no
 * `WATERFALL_EXECUTE`, because BEYU OS decides allocations and Finance OS
 * executes them. Adding a capability here is a deliberate act that widens what
 * every attached OS could potentially be granted, so it warrants review.
 */
export enum OsCapability {
  /** Read the organizational hierarchy down to the Sector LLC boundary. */
  OrganizationRead = 'ORGANIZATION_READ',
  /** Read entities, jurisdictions and ownership structure. */
  OwnershipRead = 'OWNERSHIP_READ',
  /** Read approved governance decisions relevant to the OS's own scope. */
  GovernanceRead = 'GOVERNANCE_READ',
  /** Read strategic objectives cascaded to the OS's sector. */
  StrategyRead = 'STRATEGY_READ',
  /** Raise a risk into the group register. Cannot read others' risks. */
  RiskSubmit = 'RISK_SUBMIT',
  /** Read compliance obligations that apply to the OS's jurisdiction. */
  ComplianceRead = 'COMPLIANCE_READ',
  /** Submit evidence against a compliance obligation. */
  ComplianceSubmit = 'COMPLIANCE_SUBMIT',
  /** Read approved capital allocations directed at the OS. */
  CapitalRead = 'CAPITAL_READ',
  /** Request capital. A request is not an approval; humans decide. */
  CapitalRequest = 'CAPITAL_REQUEST',
  /** Read waterfall DECISIONS. Strategic output only, never execution. */
  WaterfallDecisionRead = 'WATERFALL_DECISION_READ',
  /** Report actual inflows upward as an input to future waterfall runs. */
  FinancialReportSubmit = 'FINANCIAL_REPORT_SUBMIT',
  /** Read documents explicitly shared with the OS. */
  DocumentRead = 'DOCUMENT_READ',
  /** Write to the group audit trail. Append-only, like every other writer. */
  AuditWrite = 'AUDIT_WRITE',
  /** Subscribe to `beyu.*` domain events on granted topics. */
  EventSubscribe = 'EVENT_SUBSCRIBE',
  /** Publish `os.*` events back to the control plane. */
  EventPublish = 'EVENT_PUBLISH',
  /** Verify identity assertions for single sign-on. */
  IdentityVerify = 'IDENTITY_VERIFY',
}

/**
 * Capabilities that are NEVER granted to an attached OS, whatever the registry
 * row says.
 *
 * This is a deny list that outranks configuration. A misconfigured grant, a
 * bad migration or a compromised admin account cannot hand out these
 * capabilities, because the check is not "is it granted?" but "is it
 * forbidden?" first. Each entry encodes a rule from the master specification
 * that must survive operator error.
 */
export const NEVER_GRANTABLE_CAPABILITIES: readonly string[] = [
  // BEYU OS owns strategic waterfall decisioning. Finance OS executes.
  // No attached OS may execute a waterfall through the control plane.
  'WATERFALL_EXECUTE',
  // Approval is a human act inside BEYU OS governance.
  'CAPITAL_APPROVE',
  'GOVERNANCE_APPROVE',
  // The audit chain is append-only for everyone, including BEYU OS itself.
  'AUDIT_UPDATE',
  'AUDIT_DELETE',
  // No OS reaches into the control plane database. Not once, not read-only.
  'DATABASE_ACCESS',
  'DATABASE_READ',
  'DATABASE_WRITE',
  // Authorization decisions are made by BEYU OS, never delegated outward.
  'AUTHORIZATION_BYPASS',
  'POLICY_OVERRIDE',
  // One OS may never read another's data through the control plane.
  'CROSS_OS_READ',
] as const;

/**
 * The attachment slot an OS occupies in the organizational hierarchy.
 *
 * A sector OS hangs off a Sector LLC — the exact boundary where BEYU OS stops.
 * FOUNDATION OS hangs off BEYU FOUNDATION, which is a SISTER organization to
 * BEYU HOLDING COMPANY and not a subsidiary of it. Keeping these as distinct
 * kinds means the Foundation can never be silently re-parented under the
 * holding company by an OS registration.
 */
export enum OsAttachmentKind {
  /** Attaches beneath a SECTOR_LLC node. Health, Agriculture, Finance. */
  SectorOs = 'SECTOR_OS',
  /** Attaches beneath the FOUNDATION node. Independent of the holding company. */
  FoundationOs = 'FOUNDATION_OS',
  /** BEYU OS itself. Exactly one, and it attaches to nothing. */
  Core = 'CORE',
}

/** A registered OS in the federation (spec §71). */
export interface OsRegistration {
  id: string;
  /** Stable machine identifier, e.g. `health-os`. Immutable once created. */
  osId: string;
  name: string;
  attachmentKind: OsAttachmentKind;
  /** Required for SECTOR_OS, null for FOUNDATION_OS and CORE. */
  sectorCode: string | null;
  /** The org node this OS attaches beneath. Null until attached. */
  attachedNodeId: string | null;
  version: string;
  status: OsStatus;
  /** ISO-3166 alpha-2 codes. Empty means no country restriction. */
  countryAvailability: readonly string[];
  ownerEntityId: string | null;
  apiEndpoint: string | null;
  /** Granted capabilities. Empty on registration — isolation is the default. */
  capabilities: readonly OsCapability[];
  /** `beyu.*` topics this OS may subscribe to. Empty on registration. */
  eventSubscriptions: readonly string[];
  /** Data-sharing contract governing what this OS may expose to BEYU OS. */
  dataSharingPolicyId: string | null;
  complianceProfileId: string | null;
  integrationStatus: OsIntegrationStatus;
  healthStatus: OsHealthStatus;
  lastHealthCheckAt: string | null;
  isCore: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Legal status transitions (spec §71).
 *
 * Two properties worth stating explicitly, because both are security
 * relevant. An OS can only become ACTIVE by passing through
 * SECURITY_VALIDATION — there is no path from REGISTERED straight to ACTIVE,
 * so an operator cannot skip review by picking the right status. And RETIRED
 * is terminal: a decommissioned `osId` is never resurrected, because its old
 * identifier may still appear throughout historical audit records and reusing
 * it would make that history ambiguous.
 */
export const OS_STATUS_TRANSITIONS: Record<OsStatus, readonly OsStatus[]> = {
  [OsStatus.Registered]: [OsStatus.Configuring, OsStatus.Retired],
  [OsStatus.Configuring]: [OsStatus.SecurityValidation, OsStatus.Retired],
  [OsStatus.SecurityValidation]: [
    // Back to configuring if review finds problems.
    OsStatus.Configuring,
    OsStatus.Active,
    OsStatus.Retired,
  ],
  [OsStatus.Active]: [OsStatus.Suspended, OsStatus.Retired],
  [OsStatus.Suspended]: [OsStatus.Active, OsStatus.Retired],
  [OsStatus.Retired]: [],
};

/** Whether a lifecycle transition is permitted. */
export function canTransitionOsStatus(from: OsStatus, to: OsStatus): boolean {
  return OS_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Raised when a capability grant is refused. */
export class ForbiddenCapabilityError extends Error {
  constructor(public readonly capability: string) {
    super(
      `Capability "${capability}" can never be granted to an attached OS. ` +
        'It is on the deny list because it would let an external system bypass ' +
        'BEYU OS authorization, mutate the audit trail, execute financial ' +
        'transactions, or read another OS\u2019s data.',
    );
    this.name = 'ForbiddenCapabilityError';
  }
}

/**
 * Validates a set of requested capabilities.
 *
 * Checks the deny list BEFORE checking whether the value is a known
 * capability. The ordering matters: a forbidden capability should produce the
 * specific "never grantable" explanation rather than a vague "unknown value",
 * both because it is the more accurate message and because it makes the
 * attempt obvious in the audit trail.
 */
export function assertCapabilitiesGrantable(capabilities: readonly string[]): void {
  const known = new Set<string>(Object.values(OsCapability));
  for (const capability of capabilities) {
    const normalized = capability.trim().toUpperCase();
    if (NEVER_GRANTABLE_CAPABILITIES.includes(normalized)) {
      throw new ForbiddenCapabilityError(normalized);
    }
    if (!known.has(normalized)) {
      throw new ForbiddenCapabilityError(normalized);
    }
  }
}

/**
 * The org node type an OS of the given attachment kind must sit beneath.
 * Mirrors CANONICAL_PARENT_RULES; kept as a function so the mapping is stated
 * once and cannot drift between the registry and the hierarchy validator.
 */
export function requiredParentTypeForOs(kind: OsAttachmentKind): string | null {
  switch (kind) {
    case OsAttachmentKind.SectorOs:
      return 'SECTOR_LLC';
    case OsAttachmentKind.FoundationOs:
      return 'FOUNDATION';
    case OsAttachmentKind.Core:
      return null;
  }
}

/**
 * Events an attached OS may publish back to the control plane.
 *
 * Namespaced `os.*` rather than `beyu.*` to keep provenance unambiguous in the
 * event log: anything under `os.` came from outside the control plane and is
 * untrusted input until validated against its contract.
 */
export enum OsInboundEvent {
  RiskRaised = 'os.risk.raised',
  ComplianceEvidenceSubmitted = 'os.compliance.evidence.submitted',
  CapitalRequested = 'os.capital.requested',
  FinancialReportSubmitted = 'os.financial.report.submitted',
  HealthReported = 'os.health.reported',
}
