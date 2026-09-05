/**
 * BEYU OS — Policy engine (spec §17, §54, §57).
 *
 * Deny-by-default authorization combining RBAC and ABAC. Every sensitive
 * request is evaluated across the full chain:
 *
 *   USER -> IDENTITY -> AUTHENTICATION -> ROLE -> ORGANIZATION -> TENANT
 *        -> OS -> RESOURCE -> ACTION
 *
 * This module is pure and synchronous so it is trivially testable and can be
 * reused by the API, by Noelia's tool layer and by integration services.
 */

import {
  type AccessRequest,
  Action,
  type AuthorizationDecision,
  CLASSIFICATION_ORDER,
  DataClassification,
  OsId,
  type Permission,
  ResourceType,
  Role,
  type SecurityContext,
} from '@beyu/types';

/** Actions considered high-impact; they require MFA and human accountability. */
export const HIGH_IMPACT_ACTIONS: readonly Action[] = [
  Action.Approve,
  Action.Delete,
  Action.Execute,
  Action.Manage,
] as const;

/** Resources whose mutation is material and always requires approval (spec §56). */
export const MATERIAL_RESOURCES: readonly ResourceType[] = [
  ResourceType.Capital,
  ResourceType.Waterfall,
  ResourceType.Ownership,
  ResourceType.Governance,
  ResourceType.Compliance,
  ResourceType.Organization,
] as const;

/**
 * Canonical role -> permission mapping (RBAC baseline).
 * ABAC constraints attached to a principal narrow these further; they never
 * widen them.
 */
/**
 * Resource/action pairs that NO role may ever hold, however broad its grant.
 *
 * The audit trail is append-only: the database revokes UPDATE and DELETE on
 * `audit.audit_log` (migration 0006), and any hole punched here would create a
 * permission the storage layer refuses to honour — a confusing runtime failure
 * at best, and a false sense of authority at worst. `Manage` is excluded too,
 * because it acts as a wildcard over other actions in `authorize()`.
 *
 * Audit records are still readable and exportable; they simply cannot be
 * rewritten or erased by anyone, including the trust administrator.
 */
const NEVER_GRANTABLE: ReadonlyArray<{ resource: ResourceType; action: Action }> = [
  { resource: ResourceType.Audit, action: Action.Create },
  { resource: ResourceType.Audit, action: Action.Update },
  { resource: ResourceType.Audit, action: Action.Delete },
  { resource: ResourceType.Audit, action: Action.Manage },
];

function isNeverGrantable(resource: ResourceType, action: Action): boolean {
  return NEVER_GRANTABLE.some((f) => f.resource === resource && f.action === action);
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.TrustAdministrator]: allResources([
    Action.Create,
    Action.Read,
    Action.Update,
    Action.Delete,
    Action.Approve,
    Action.Export,
    Action.Manage,
  ]),
  [Role.Trustee]: [
    ...allResources([Action.Read, Action.Export]),
    ...on(
      [
        ResourceType.Governance,
        ResourceType.Ownership,
        ResourceType.Capital,
        ResourceType.Waterfall,
        ResourceType.Strategy,
      ],
      [Action.Approve, Action.Create, Action.Update],
    ),
  ],
  [Role.GroupExecutive]: [
    ...allResources([Action.Read, Action.Export]),
    ...on(
      [
        ResourceType.Strategy,
        ResourceType.Risk,
        ResourceType.Capital,
        ResourceType.Document,
        ResourceType.Report,
        ResourceType.Workflow,
      ],
      [Action.Create, Action.Update],
    ),
    ...on([ResourceType.Workflow, ResourceType.Document], [Action.Approve]),
  ],
  [Role.BoardDirector]: [
    ...on(
      [
        ResourceType.Governance,
        ResourceType.Strategy,
        ResourceType.Risk,
        ResourceType.Compliance,
        ResourceType.Report,
        ResourceType.Document,
        ResourceType.Organization,
        ResourceType.Ownership,
        ResourceType.Capital,
        ResourceType.Waterfall,
      ],
      [Action.Read, Action.Export],
    ),
    ...on([ResourceType.Governance], [Action.Create, Action.Update, Action.Approve]),
  ],
  [Role.CountryDirector]: [
    ...on(
      [
        ResourceType.Organization,
        ResourceType.Tenant,
        ResourceType.Strategy,
        ResourceType.Risk,
        ResourceType.Compliance,
        ResourceType.Report,
        ResourceType.Document,
        ResourceType.Country,
        ResourceType.Sector,
      ],
      [Action.Read, Action.Create, Action.Update, Action.Export],
    ),
  ],
  [Role.SectorDirector]: [
    ...on(
      [
        ResourceType.Sector,
        ResourceType.Strategy,
        ResourceType.Risk,
        ResourceType.Report,
        ResourceType.Document,
        ResourceType.Tenant,
      ],
      [Action.Read, Action.Create, Action.Update, Action.Export],
    ),
  ],
  [Role.CapitalController]: [
    ...on(
      [ResourceType.Capital, ResourceType.Waterfall],
      [Action.Read, Action.Create, Action.Update, Action.Export],
    ),
    ...on([ResourceType.Report, ResourceType.Document], [Action.Read, Action.Export]),
  ],
  [Role.RiskOfficer]: [
    ...on(
      [ResourceType.Risk],
      [Action.Read, Action.Create, Action.Update, Action.Export, Action.Manage],
    ),
    ...on(
      [ResourceType.Compliance, ResourceType.Report, ResourceType.Document],
      [Action.Read, Action.Export],
    ),
  ],
  [Role.ComplianceOfficer]: [
    ...on(
      [ResourceType.Compliance],
      [Action.Read, Action.Create, Action.Update, Action.Export, Action.Manage],
    ),
    ...on(
      [ResourceType.Risk, ResourceType.Report, ResourceType.Document, ResourceType.Audit],
      [Action.Read, Action.Export],
    ),
  ],
  [Role.GovernanceSecretary]: [
    ...on(
      [ResourceType.Governance, ResourceType.Document],
      [Action.Read, Action.Create, Action.Update, Action.Export],
    ),
    ...on([ResourceType.Workflow, ResourceType.Notification], [Action.Read, Action.Create]),
  ],
  // Auditors read everything but can never mutate state.
  [Role.Auditor]: allResources([Action.Read, Action.Export]),
  [Role.TenantAdministrator]: [
    ...on(
      [
        ResourceType.Tenant,
        ResourceType.User,
        ResourceType.Document,
        ResourceType.Workflow,
        ResourceType.Report,
        ResourceType.Notification,
      ],
      [Action.Read, Action.Create, Action.Update, Action.Manage, Action.Export],
    ),
  ],
  [Role.TenantUser]: [
    ...on(
      [ResourceType.Document, ResourceType.Workflow, ResourceType.Notification],
      [Action.Read, Action.Create],
    ),
    ...on([ResourceType.Report], [Action.Read]),
  ],
  [Role.ServiceAccount]: [
    ...on([ResourceType.Integration], [Action.Read, Action.Create, Action.Execute]),
    ...on([ResourceType.Report, ResourceType.Strategy], [Action.Read]),
  ],
  [Role.ReadOnly]: allResources([Action.Read]),
};

function allResources(actions: Action[]): Permission[] {
  return on(Object.values(ResourceType), actions);
}

function on(resources: ResourceType[], actions: Action[]): Permission[] {
  const out: Permission[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      // Filtered at construction so a broad grant like allResources([...])
      // cannot quietly pick up a forbidden pair.
      if (isNeverGrantable(resource, action)) continue;
      out.push({ resource, action });
    }
  }
  return out;
}

/** Expands a principal's roles into their baseline permission set. */
export function permissionsForRoles(roles: Role[]): Permission[] {
  const seen = new Set<string>();
  const result: Permission[] = [];
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      const key = `${permission.resource}:${permission.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(permission);
      }
    }
  }
  return result;
}

const DENY = (reason: string): AuthorizationDecision => ({ allowed: false, reason });

/**
 * Evaluates an access request against a security context.
 * Deny-by-default: every branch must explicitly permit the request.
 */
export function authorize(
  context: SecurityContext,
  request: AccessRequest,
): AuthorizationDecision {
  // 1. Authentication / session validity.
  if (!context.userId || !context.identityId) {
    return DENY('No authenticated principal.');
  }
  if (context.expiresAt <= Date.now()) {
    return DENY('Security context has expired.');
  }

  // 2. Step-up authentication for high-impact actions.
  if (
    HIGH_IMPACT_ACTIONS.includes(request.action as Action) &&
    !context.mfaSatisfied &&
    !context.isServiceAccount
  ) {
    return DENY(
      `Action "${request.action}" is high-impact and requires multi-factor authentication.`,
    );
  }

  // 3. OS boundary. A principal may only reach operating systems it is
  //    provisioned for; a shared identity does NOT imply cross-OS access.
  const targetOs = request.osId ?? OsId.BeyuOs;
  if (!context.osIds.includes(targetOs)) {
    return DENY(
      `Principal is not authorized for ${targetOs}. A shared BEYU identity does not ` +
        'grant cross-OS data access.',
    );
  }

  // 4. Tenant boundary. Tenant-scoped requests must target a tenant the
  //    principal belongs to. Never rely on frontend filtering.
  if (request.tenantId) {
    const tenantAllowed =
      context.tenantIds.includes(request.tenantId) ||
      hasRole(context, Role.TrustAdministrator) ||
      hasRole(context, Role.Auditor);
    if (!tenantAllowed) {
      return DENY(`Principal has no membership in tenant ${request.tenantId}.`);
    }
  }

  // 5. Data classification ceiling.
  if (request.classification) {
    const requested = CLASSIFICATION_ORDER[request.classification];
    const ceiling = CLASSIFICATION_ORDER[context.maxClassification];
    if (requested > ceiling) {
      return DENY(
        `Record classification ${request.classification} exceeds the principal's ` +
          `clearance ${context.maxClassification}.`,
      );
    }
    // Sector-sensitive data never crosses into the BEYU OS control plane.
    if (
      request.classification === DataClassification.SectorSensitive &&
      targetOs === OsId.BeyuOs
    ) {
      return DENY(
        'Sector-sensitive data must remain within its owning Sector OS boundary ' +
          'and cannot be read through the BEYU OS control plane.',
      );
    }
  }

  // 6. Absolute prohibitions. Checked against the REQUEST, not just the
  //    permission table, so a grant loaded from the database or injected by a
  //    future code path still cannot authorize rewriting the audit trail.
  if (isNeverGrantable(request.resource, request.action as Action)) {
    return DENY(
      `Action "${request.action}" on "${request.resource}" is never permitted. ` +
        'The audit trail is append-only and cannot be modified by any principal.',
    );
  }

  // 7. RBAC + ABAC: find a permission that grants this resource/action.
  const candidates = context.permissions.filter(
    (p) =>
      (p.resource === request.resource || (p.resource as string) === '*') &&
      (p.action === request.action || p.action === Action.Manage),
  );

  if (candidates.length === 0) {
    return DENY(
      `No permission grants "${request.action}" on "${request.resource}" for roles ` +
        `[${context.roles.join(', ')}].`,
    );
  }

  for (const permission of candidates) {
    const constraintCheck = evaluateConstraints(context, request, permission);
    if (constraintCheck.allowed) {
      return {
        allowed: true,
        reason: `Granted by ${permission.resource}:${permission.action}.`,
        matchedPermission: permission,
        obligations: buildObligations(request),
      };
    }
  }

  return DENY(
    `Permission for "${request.action}" on "${request.resource}" exists but its ` +
      'attribute constraints were not satisfied.',
  );
}

/** Evaluates the ABAC constraints attached to a permission. */
function evaluateConstraints(
  context: SecurityContext,
  request: AccessRequest,
  permission: Permission,
): AuthorizationDecision {
  const c = permission.constraints;
  if (!c) {
    return { allowed: true, reason: 'No attribute constraints.' };
  }

  if (c.tenantIds?.length) {
    if (!request.tenantId || !c.tenantIds.includes(request.tenantId)) {
      return DENY('Tenant constraint not satisfied.');
    }
  }
  if (c.organizationIds?.length) {
    if (!request.organizationId || !c.organizationIds.includes(request.organizationId)) {
      return DENY('Organization constraint not satisfied.');
    }
  }
  if (c.countryCodes?.length) {
    if (!request.countryCode || !c.countryCodes.includes(request.countryCode)) {
      return DENY('Country constraint not satisfied.');
    }
  }
  if (c.osIds?.length) {
    const targetOs = request.osId ?? OsId.BeyuOs;
    if (!c.osIds.includes(targetOs)) {
      return DENY('OS constraint not satisfied.');
    }
  }
  if (c.maxClassification && request.classification) {
    if (
      CLASSIFICATION_ORDER[request.classification] >
      CLASSIFICATION_ORDER[c.maxClassification]
    ) {
      return DENY('Classification constraint not satisfied.');
    }
  }
  if (c.ownRecordsOnly) {
    if (!request.ownerUserId || request.ownerUserId !== context.userId) {
      return DENY('Principal may only access records they own.');
    }
  }
  return { allowed: true, reason: 'Attribute constraints satisfied.' };
}

/** Obligations the caller must honour after an allow decision. */
function buildObligations(request: AccessRequest): string[] {
  const obligations: string[] = ['AUDIT'];
  if (
    MATERIAL_RESOURCES.includes(request.resource) &&
    request.action !== Action.Read &&
    request.action !== Action.Export
  ) {
    obligations.push('REQUIRE_HUMAN_APPROVAL');
  }
  if (request.action === Action.Export) {
    obligations.push('APPLY_DATA_MINIMIZATION');
  }
  return obligations;
}

export function hasRole(context: SecurityContext, role: Role): boolean {
  return context.roles.includes(role);
}

/**
 * Convenience guard that throws when a request is not permitted.
 * Domain services use this so a missing check fails closed.
 */
export class AuthorizationError extends Error {
  readonly decision: AuthorizationDecision;
  constructor(decision: AuthorizationDecision) {
    super(decision.reason);
    this.name = 'AuthorizationError';
    this.decision = decision;
  }
}

export function assertAuthorized(
  context: SecurityContext,
  request: AccessRequest,
): AuthorizationDecision {
  const decision = authorize(context, request);
  if (!decision.allowed) {
    throw new AuthorizationError(decision);
  }
  return decision;
}
