/**
 * Translating a security context into a database RLS context (spec §51, §52).
 *
 * This is the single bridge between "who is asking" (the policy engine's view)
 * and "what the database will let them see" (the RLS view). It exists as one
 * function so the cross-tenant decision is made in exactly one place and can
 * be audited by reading a single file.
 *
 * The rule: `crossTenant` is granted ONLY for trust-level roles, and is never
 * derived from a header, a query parameter or a request body. A tenant user
 * cannot ask to be treated as trust-level.
 */

import { Role, type SecurityContext } from '@beyu/types';

import type { RequestContext } from '../db/driver';

/**
 * Roles that legitimately see across tenant boundaries.
 *
 * Trust administrators operate the control plane itself, and auditors must be
 * able to inspect the whole estate — an auditor who could only see one tenant
 * could not verify the audit chain, which is global. Every other role,
 * including GroupExecutive, is confined to the tenants it holds.
 */
export const CROSS_TENANT_ROLES: readonly Role[] = [Role.TrustAdministrator, Role.Auditor];

/** True when the principal holds a role that legitimately spans tenants. */
export function isCrossTenant(security: SecurityContext): boolean {
  return security.roles.some((role) => CROSS_TENANT_ROLES.includes(role));
}

/**
 * Builds the database context for a request.
 *
 * `tenantId` is taken from the *resolved* active tenant, which the
 * authentication layer set from the user's actual memberships — not from
 * anything the caller sent.
 */
export function toDatabaseContext(security: SecurityContext): RequestContext {
  return {
    tenantId: security.activeTenantId,
    userId: security.userId,
    crossTenant: isCrossTenant(security),
  };
}

/**
 * The context used by unauthenticated or system-internal work (health checks,
 * migrations, background jobs). It grants no tenant and no cross-tenant
 * privilege, so RLS denies tenant-scoped rows outright.
 */
export const SYSTEM_CONTEXT: RequestContext = {
  tenantId: null,
  userId: null,
  crossTenant: false,
};
