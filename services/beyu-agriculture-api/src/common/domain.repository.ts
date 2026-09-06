import type { Database, DatabaseSession } from '../db/driver';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- AuditRepository is constructor-injected; a type-only import erases it from design:paramtypes and Nest DI fails at runtime.
import { AuditRepository, type AppendAuditInput } from '../modules/audit/audit.repository';
import type { AgriSecurityContext } from './security';
import { toDatabaseContext } from './tenant-scope';
import { notFound } from './errors';

export interface MutationDescriptor {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'EXECUTE' | 'LOGIN' | 'ACCESS';
  resourceType: string;
  resourceId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Base class for all domain repositories: every read runs inside an RLS
 * tenant context, and every mutation appends a hash-chained audit event
 * in the SAME transaction as the data change.
 */
export abstract class DomainRepository {
  constructor(
    protected readonly db: Database,
    protected readonly audit: AuditRepository,
  ) {}

  /**
   * App-layer tenant assertion for single-object paths (get/update/delete).
   * RLS already enforces this at the database in production Postgres; this
   * keeps isolation true on every driver, including dev/CI PGLite where the
   * connection is privileged and RLS is bypassed. A cross-tenant object is
   * reported as 404 (no existence leak).
   */
  protected assertRowVisible(security: AgriSecurityContext, row: { tenant_id?: string | null } | undefined, resource: string, id: string): void {
    if (!row) return; // caller handles notFound for missing rows
    if (security.roles.includes('SUPER_ADMIN') || security.roles.includes('AUDITOR')) return;
    const myTenant = security.activeTenantId ?? security.tenantId;
    if (myTenant && row.tenant_id && row.tenant_id !== myTenant) notFound(resource, id);
  }

  protected read<T>(security: AgriSecurityContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.db.withContext(toDatabaseContext(security), fn);
  }

  protected async mutate<T>(
    security: AgriSecurityContext,
    fn: (session: DatabaseSession) => Promise<T>,
    describe: (result: T) => MutationDescriptor,
  ): Promise<T> {
    return this.db.withContext(toDatabaseContext(security), async (session) => {
      const result = await fn(session);
      const descriptor = describe(result);
      const input: AppendAuditInput = {
        actorUserId: security.userId,
        tenantId: security.activeTenantId ?? security.tenantId,
        action: descriptor.action,
        resourceType: descriptor.resourceType,
        resourceId: descriptor.resourceId ?? null,
        previousState: descriptor.previousState ?? null,
        newState: descriptor.newState ? (descriptor.newState as any) : null,
        reason: descriptor.reason ?? null,
        ipAddress: security.ipAddress ?? null,
        userAgent: security.userAgent ?? null,
        purposeOfUse: security.purposeOfUse ?? null,
        farmId: security.farmIds?.[0] ?? null,
      };
      await this.audit.append(input, session);
      return result;
    });
  }
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function resolveLimit(limit?: number): number {
  return Math.min(100, Math.max(1, Number(limit ?? 20)));
}
export function resolveOffset(offset?: number): number {
  return Math.max(0, Number(offset ?? 0));
}
