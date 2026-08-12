import type { HealthSecurityContext } from './security';
import type { RequestContext } from '../db/driver';

export function toDatabaseContext(security: HealthSecurityContext): RequestContext {
  return {
    tenantId: security.activeTenantId ?? security.tenantId ?? null,
    userId: security.userId,
    crossTenant: security.roles.includes('SUPER_ADMIN') || security.roles.includes('AUDITOR'),
  };
}
