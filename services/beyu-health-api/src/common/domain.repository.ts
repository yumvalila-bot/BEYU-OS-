import type { Database, DatabaseSession } from '../db/driver';
import { AuditRepository, type AppendAuditInput } from '../modules/audit/audit.repository';
import type { HealthSecurityContext } from './security';
import { toDatabaseContext } from './tenant-scope';

export interface MutationDescriptor {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'EXECUTE' | 'LOGIN' | 'ACCESS';
  resourceType: string;
  resourceId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
}

export abstract class DomainRepository {
  constructor(
    protected readonly db: Database,
    protected readonly audit: AuditRepository,
  ) {}

  protected read<T>(security: HealthSecurityContext, fn: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.db.withContext(toDatabaseContext(security), fn);
  }

  protected async mutate<T>(
    security: HealthSecurityContext,
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
        facilityId: security.facilityIds?.[0] ?? null,
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
