import type { AgriSecurityContext } from './security';
import type { RequestContext } from '../db/driver';

export function toDatabaseContext(security: AgriSecurityContext): RequestContext {
  return {
    tenantId: security.activeTenantId ?? security.tenantId ?? null,
    userId: security.userId,
    crossTenant: security.roles.includes('SUPER_ADMIN') || security.roles.includes('AUDITOR'),
  };
}
