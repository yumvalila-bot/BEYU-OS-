/**
 * Authorization guard (spec §55, §56).
 *
 * Backend authorization is mandatory and deny-by-default. A handler with no
 * @RequirePermission metadata is REJECTED rather than allowed through: an
 * unannotated endpoint is a mistake, not a public one. Endpoints that really
 * are public must say so explicitly with @Public().
 */

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { authorize } from '@beyu/auth';
import type { AccessRequest, Action, DataClassification, ResourceType } from '@beyu/types';

import { getRequestContext } from './request-context';

export const PUBLIC_ROUTE = 'beyu:public';
/** Marks a route as reachable without authentication (login, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

export const REQUIRED_PERMISSION = 'beyu:required-permission';

export interface RequiredPermission {
  resource: ResourceType;
  action: Action;
  classification?: DataClassification;
}

/** Declares the permission a handler requires. */
export const RequirePermission = (
  resource: ResourceType,
  action: Action,
  classification?: DataClassification,
): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION, { resource, action, classification } as RequiredPermission);

@Injectable()
export class AuthorizationGuard implements CanActivate {
  // Tokens are injected explicitly rather than by reflected parameter types:
  // the dev runtime (esbuild) does not emit `design:paramtypes`, so implicit
  // constructor injection would silently resolve to undefined.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(executionContext: ExecutionContext): boolean {
    if (executionContext.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    if (isPublic) return true;

    const security = getRequestContext()?.security ?? null;
    if (!security) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const required = this.reflector.get<RequiredPermission | undefined>(
      REQUIRED_PERMISSION,
      executionContext.getHandler(),
    );
    if (!required) {
      // Fail closed. An endpoint that forgot to declare its permission must
      // not silently become an unguarded hole in the control plane.
      throw new ForbiddenException(
        'This endpoint does not declare a required permission and is therefore denied. ' +
          'Annotate it with @RequirePermission or @Public.',
      );
    }

    const request = executionContext
      .switchToHttp()
      .getRequest<{ params?: Record<string, string>; query?: Record<string, string> }>();

    const authorizationRequest: AccessRequest = {
      resource: required.resource,
      action: required.action,
      resourceId: request.params?.id,
      tenantId: security.activeTenantId,
      classification: required.classification,
    };

    const decision = authorize(security, authorizationRequest);
    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason);
    }

    // Obligations (audit, human approval, data minimization) travel with the
    // request so downstream handlers can honour them.
    (request as { beyuObligations?: unknown }).beyuObligations = decision.obligations ?? [];
    return true;
  }
}
