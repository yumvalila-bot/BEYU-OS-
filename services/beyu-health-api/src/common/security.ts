export interface HealthSecurityContext {
  userId: string;
  identityId?: string | null;
  email: string;
  displayName: string;
  tenantId: string | null;
  facilityIds: string[];
  roles: string[];
  permissions: Array<{ resource: string; action: string }>;
  activeTenantId: string | null;
  mfaSatisfied: boolean;
  isServiceAccount: boolean;
  purposeOfUse?: string | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function hasRole(ctx: HealthSecurityContext, role: string): boolean {
  return ctx.roles.includes(role);
}

export function hasPermission(ctx: HealthSecurityContext, resource: string, action: string): boolean {
  return ctx.permissions.some(p => p.resource === resource && p.action === action) || ctx.roles.includes('SUPER_ADMIN');
}

export function assertTenantAccess(ctx: HealthSecurityContext, tenantId: string): void {
  if (ctx.roles.includes('SUPER_ADMIN')) return;
  if (ctx.tenantId && ctx.tenantId !== tenantId && ctx.activeTenantId !== tenantId) {
    const err: any = new Error('Forbidden: tenant access denied');
    err.status = 403;
    throw err;
  }
}
