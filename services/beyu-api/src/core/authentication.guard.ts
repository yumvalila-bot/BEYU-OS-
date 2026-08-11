/**
 * Authentication guard (spec §55).
 *
 * Resolves a bearer token into a security context and attaches it to the
 * request. It runs BEFORE the authorization guard, which then decides what
 * that principal may do.
 *
 * This guard never denies for lack of a token — that is the authorization
 * guard's job, so that the reason a request failed is decided in one place. It
 * denies only when a token is present and invalid.
 */

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from '../modules/auth/auth.service';
import { PUBLIC_ROUTE } from './authorization.guard';
import { getRequestContext, setSecurityContext } from './request-context';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (executionContext.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);

    const request = executionContext
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();

    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return true; // No credentials presented; authorization decides.

    const [scheme, token] = raw.split(' ');
    if (!/^Bearer$/i.test(scheme ?? '') || !token) {
      // A malformed Authorization header on a public route is ignored rather
      // than fatal; the route needs no credentials either way.
      if (isPublic) return true;
      return true; // Authorization will reject: no context was attached.
    }

    const context = getRequestContext();
    try {
      const security = await this.auth.resolveSecurityContext(token, {
        requestId: context?.requestId ?? 'unknown',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      setSecurityContext(security);
    } catch (error) {
      // A token that is present but invalid is a real failure, even on a
      // public route: the caller believes they are authenticated.
      if (isPublic) return true;
      throw error;
    }

    return true;
  }
}
