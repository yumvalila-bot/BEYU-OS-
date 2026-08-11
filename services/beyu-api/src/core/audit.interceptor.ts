/**
 * Audit interceptor (spec §39).
 *
 * Every state-changing request is recorded in the append-only, hash-chained
 * audit trail — successes, denials and failures alike. Audit failure is not
 * fatal to the response: the chain is the system of record for what happened,
 * but a broken audit writer must not take down the API. Failures are logged
 * loudly so the gap is visible.
 *
 * Reads are deliberately NOT audited here. Auditing every GET would swamp the
 * chain; read auditing is applied selectively at the handler level for
 * sensitive resources via the AUDIT_READ metadata flag.
 */

import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';

import { AuditRepository, type AppendAuditInput } from '../modules/audit/audit.repository';
import { getRequestContext } from './request-context';

/** Marks a read handler as sensitive enough to audit. */
export const AUDIT_READ = 'beyu:audit-read';
export const AuditRead = (): MethodDecorator => SetMetadata(AUDIT_READ, true);

/** Overrides the resource type recorded for a handler. */
export const AUDIT_RESOURCE = 'beyu:audit-resource';
export const AuditResource = (resource: string): MethodDecorator =>
  SetMetadata(AUDIT_RESOURCE, resource);

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
  GET: 'READ',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  // Explicit tokens: esbuild does not emit `design:paramtypes`.
  constructor(
    @Inject(AuditRepository) private readonly audit: AuditRepository,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() !== 'http') return next.handle();

    const http = executionContext.switchToHttp();
    const request = http.getRequest<{ method: string; url: string; params?: Record<string, string> }>();
    const method = (request.method ?? 'GET').toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    const auditRead = this.reflector.get<boolean>(AUDIT_READ, executionContext.getHandler()) ?? false;

    if (!isMutation && !auditRead) return next.handle();

    const resourceType =
      this.reflector.get<string>(AUDIT_RESOURCE, executionContext.getHandler()) ??
      deriveResource(request.url ?? '');

    return next.handle().pipe(
      tap({
        next: () => {
          void this.record(executionContext, resourceType, method, 'SUCCESS', null);
        },
        error: (error: unknown) => {
          const status = (error as { status?: number })?.status ?? 500;
          const outcome = status === 401 || status === 403 ? 'DENIED' : status < 500 ? 'FAILURE' : 'ERROR';
          const reason = error instanceof Error ? error.message : String(error);
          void this.record(executionContext, resourceType, method, outcome, reason);
        },
      }),
    );
  }

  private async record(
    executionContext: ExecutionContext,
    resourceType: string,
    method: string,
    outcome: AppendAuditInput['outcome'],
    reason: string | null,
  ): Promise<void> {
    const context = getRequestContext();
    const security = context?.security ?? null;
    const request = executionContext
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; url?: string }>();

    const input: AppendAuditInput = {
      actorUserId: security?.userId ?? null,
      actorIdentityId: security?.identityId ?? null,
      actorType: security ? (security.isServiceAccount ? 'SERVICE' : 'USER') : 'SYSTEM',
      tenantId: security?.activeTenantId ?? null,
      organizationId: security?.organizationIds?.[0] ?? null,
      osId: 'BEYU_OS',
      action: METHOD_TO_ACTION[method] ?? method,
      resourceType,
      resourceId: request.params?.id ?? null,
      outcome,
      reason,
      requestId: context?.requestId ?? null,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      applicationContext: context ? `${context.method} ${context.path}` : null,
      authorizationContext: security
        ? { roles: security.roles, osIds: security.osIds, mfaSatisfied: security.mfaSatisfied }
        : null,
    };

    try {
      await this.audit.append(input);
    } catch (error) {
      // A gap in the audit trail is a serious operational event. Log it in a
      // form monitoring can alert on, but do not fail the user's request.
       
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'AUDIT_WRITE_FAILED',
          requestId: context?.requestId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

/** Derives a resource name from the URL: /api/v1/organizations/123 -> organization. */
function deriveResource(url: string): string {
  const path = url.split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  const versionIndex = segments.findIndex((s) => /^v\d+$/.test(s));
  const resource = versionIndex >= 0 ? segments[versionIndex + 1] : segments[0];
  if (!resource) return 'unknown';
  return resource.endsWith('s') ? resource.slice(0, -1) : resource;
}
