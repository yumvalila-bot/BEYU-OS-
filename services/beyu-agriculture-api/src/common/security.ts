import type { AgriSecurityContext } from '@beyu/agriculture-types';

export type { AgriSecurityContext } from '@beyu/agriculture-types';

export function hasRole(ctx: AgriSecurityContext, role: string): boolean {
  return ctx.roles.includes(role);
}

export function hasPermission(ctx: AgriSecurityContext, resource: string, action: string): boolean {
  return ctx.permissions.some(p => p.resource === resource && p.action === action) || ctx.roles.includes('SUPER_ADMIN');
}

export function assertTenantAccess(ctx: AgriSecurityContext, tenantId: string): void {
  if (ctx.roles.includes('SUPER_ADMIN')) return;
  if (ctx.tenantId && ctx.tenantId !== tenantId && ctx.activeTenantId !== tenantId) {
    const err: any = new Error('Forbidden: tenant access denied');
    err.status = 403;
    throw err;
  }
}
