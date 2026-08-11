/**
 * Base class for domain repositories (spec §39, §45, §51).
 *
 * Two things every domain repository must get right, centralised here so no
 * individual module can forget them:
 *
 *  1. RLS CONTEXT. Reads and writes run through `withContext`, which issues
 *     `SET LOCAL app.tenant / app.user_id / app.cross_tenant` inside the
 *     transaction. A repository that reached for `db.query` directly would
 *     bypass tenant isolation, so this class does not expose that path.
 *
 *  2. TRANSACTIONAL AUDIT. `mutate()` writes the audit record in the SAME
 *     transaction as the change it describes. That is what turns "every
 *     mutation is audited" from an aspiration into a guarantee: if the audit
 *     insert fails, the business change rolls back with it. The global
 *     AuditInterceptor is a safety net for the HTTP layer, not the primary
 *     mechanism, and it cannot capture before/after state — this can.
 */

import type { SecurityContext } from '@beyu/types';

import type { Database, DatabaseSession } from '../db/driver';
import type { AppendAuditInput, AuditRepository } from '../modules/audit/audit.repository';
import { toDatabaseContext } from './tenant-scope';

export interface MutationDescriptor {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'EXECUTE';
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

  /** Runs a read in the caller's RLS context. */
  protected read<T>(
    security: SecurityContext,
    fn: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    return this.db.withContext(toDatabaseContext(security), fn);
  }

  /**
   * Runs a write in the caller's RLS context and appends the audit record in
   * the same transaction.
   *
   * `describe` receives the value the work returned, so the audit entry can
   * name the id of a row that did not exist when the transaction began.
   */
  protected async mutate<T>(
    security: SecurityContext,
    fn: (session: DatabaseSession) => Promise<T>,
    describe: (result: T) => MutationDescriptor,
  ): Promise<T> {
    return this.db.withContext(toDatabaseContext(security), async (session) => {
      const result = await fn(session);
      const descriptor = describe(result);

      const input: AppendAuditInput = {
        actorUserId: security.userId,
        actorIdentityId: security.identityId,
        actorType: security.isServiceAccount ? 'SERVICE' : 'USER',
        tenantId: security.activeTenantId,
        organizationId: security.organizationIds[0] ?? null,
        osId: 'BEYU_OS',
        action: descriptor.action,
        resourceType: descriptor.resourceType,
        resourceId: descriptor.resourceId ?? null,
        outcome: 'SUCCESS',
        reason: descriptor.reason ?? null,
        previousState: descriptor.previousState ?? null,
        newState: descriptor.newState ?? null,
        authorizationContext: { roles: security.roles, mfaSatisfied: security.mfaSatisfied },
      };

      // Deliberately not wrapped in try/catch: a failure here must abort the
      // transaction. An unaudited change is worse than a failed one.
      await this.audit.append(input, session);
      return result;
    });
  }
}
