import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Reflector is constructor-injected; a type-only import erases it from design:paramtypes and Nest DI fails at runtime.
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import { getSecurityContext } from './request-context';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<{ resource: string; action: string }>>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const security = getSecurityContext() ?? (context.switchToHttp().getRequest() as any).user;
    if (!security) throw new ForbiddenException('No security context');
    if (security.roles.includes('SUPER_ADMIN')) return true;
    for (const req of required) {
      const ok = security.permissions.some((p: any) => p.resource === req.resource && p.action === req.action);
      if (!ok) throw new ForbiddenException(`Missing permission ${req.resource}:${req.action}`);
    }
    return true;
  }
}
