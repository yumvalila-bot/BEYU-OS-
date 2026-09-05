/**
 * BEYU OS — Authorization primitives (spec §17, §57).
 *
 * ONE IDENTITY != ONE DATA PERMISSION.
 * Every sensitive request is evaluated across:
 *   USER -> IDENTITY -> AUTHENTICATION -> ROLE -> ORGANIZATION -> TENANT
 *        -> OS -> RESOURCE -> ACTION
 */

/** Operating systems in the BEYU ecosystem. BEYU OS is the control plane. */
export enum OsId {
  BeyuOs = 'BEYU_OS',
  HealthOs = 'HEALTH_OS',
  FinanceOs = 'FINANCE_OS',
  AgricultureOs = 'AGRICULTURE_OS',
  FoundationOs = 'FOUNDATION_OS',
}

/** Actions that can be performed against a resource. */
export enum Action {
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Approve = 'approve',
  Reject = 'reject',
  Export = 'export',
  Execute = 'execute',
  Manage = 'manage',
}

/** Resource families guarded by the authorization layer. */
export enum ResourceType {
  Organization = 'organization',
  Tenant = 'tenant',
  Ownership = 'ownership',
  Governance = 'governance',
  Strategy = 'strategy',
  Risk = 'risk',
  Compliance = 'compliance',
  Capital = 'capital',
  Waterfall = 'waterfall',
  Document = 'document',
  Workflow = 'workflow',
  Report = 'report',
  Notification = 'notification',
  Integration = 'integration',
  Audit = 'audit',
  User = 'user',
  Noelia = 'noelia',
  Hive = 'hive',
  Country = 'country',
  Sector = 'sector',
  /** An attached OS in the federation (Health, Agriculture, Foundation, ...). */
  Os = 'os',
}

/** Canonical BEYU OS roles (RBAC layer). */
export enum Role {
  TrustAdministrator = 'TRUST_ADMINISTRATOR',
  Trustee = 'TRUSTEE',
  GroupExecutive = 'GROUP_EXECUTIVE',
  BoardDirector = 'BOARD_DIRECTOR',
  CountryDirector = 'COUNTRY_DIRECTOR',
  SectorDirector = 'SECTOR_DIRECTOR',
  CapitalController = 'CAPITAL_CONTROLLER',
  RiskOfficer = 'RISK_OFFICER',
  ComplianceOfficer = 'COMPLIANCE_OFFICER',
  GovernanceSecretary = 'GOVERNANCE_SECRETARY',
  Auditor = 'AUDITOR',
  TenantAdministrator = 'TENANT_ADMINISTRATOR',
  TenantUser = 'TENANT_USER',
  ServiceAccount = 'SERVICE_ACCOUNT',
  ReadOnly = 'READ_ONLY',
}

/** A single permission grant: what may be done to which resource. */
export interface Permission {
  resource: ResourceType;
  action: Action;
  /** Optional ABAC constraints narrowing the grant. */
  constraints?: PermissionConstraints;
}

/** Attribute constraints applied on top of a role grant (ABAC layer). */
export interface PermissionConstraints {
  /** Restrict to specific tenants. Empty/undefined = no tenant narrowing. */
  tenantIds?: string[];
  /** Restrict to specific organizational subtrees. */
  organizationIds?: string[];
  /** Restrict to specific countries (ISO-3166 alpha-2). */
  countryCodes?: string[];
  /** Restrict to specific operating systems. */
  osIds?: OsId[];
  /** Restrict to records at or below a classification level. */
  maxClassification?: DataClassification;
  /** Restrict to owned records only. */
  ownRecordsOnly?: boolean;
}

/** Data classification used for data governance and minimization (spec §60). */
export enum DataClassification {
  Public = 'PUBLIC',
  Internal = 'INTERNAL',
  Confidential = 'CONFIDENTIAL',
  Restricted = 'RESTRICTED',
  /** Sector-sensitive data that must never leave its owning OS boundary. */
  SectorSensitive = 'SECTOR_SENSITIVE',
}

export const CLASSIFICATION_ORDER: Record<DataClassification, number> = {
  [DataClassification.Public]: 0,
  [DataClassification.Internal]: 1,
  [DataClassification.Confidential]: 2,
  [DataClassification.Restricted]: 3,
  [DataClassification.SectorSensitive]: 4,
};

/**
 * The full security context resolved for a request. Produced by the API
 * authentication layer, consumed by every domain service — never by the
 * frontend (spec §50, §57).
 */
export interface SecurityContext {
  userId: string;
  /** Canonical BEYU identity linking a person across OSs (spec §17). */
  identityId: string;
  email: string;
  displayName: string;
  roles: Role[];
  permissions: Permission[];
  /** Tenants this principal may act within. */
  tenantIds: string[];
  /** Active tenant for this request, if tenant-scoped. */
  activeTenantId: string | null;
  /** Organizational subtree memberships. */
  organizationIds: string[];
  /** Operating systems this principal may reach. Always includes BEYU_OS here. */
  osIds: OsId[];
  countryCodes: string[];
  maxClassification: DataClassification;
  mfaSatisfied: boolean;
  /** Set when the principal is a machine identity (service-to-service). */
  isServiceAccount: boolean;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  issuedAt: number;
  expiresAt: number;
}

/** A request for an authorization decision. */
export interface AccessRequest {
  resource: ResourceType;
  action: Action;
  resourceId?: string;
  tenantId?: string | null;
  organizationId?: string | null;
  countryCode?: string | null;
  osId?: OsId;
  classification?: DataClassification;
  /** Owner of the target record, for ownRecordsOnly constraints. */
  ownerUserId?: string | null;
}

/** The outcome of an authorization decision — always explainable. */
export interface AuthorizationDecision {
  allowed: boolean;
  /** Human-readable reason; surfaced in audit records and denials. */
  reason: string;
  /** Which rule produced the decision, for debugging and audit. */
  matchedPermission?: Permission;
  obligations?: string[];
}
