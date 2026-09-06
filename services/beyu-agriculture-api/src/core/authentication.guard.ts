import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Reflector is constructor-injected; a type-only import erases it from design:paramtypes and Nest DI fails at runtime (same class of issue the controller carve-out in eslint.config.mjs documents).
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { requestContextStorage } from './request-context';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- constructor-injected provider; must remain a runtime import.
import { AuthService } from '../modules/identity/auth.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = header.slice(7);
    const store = requestContextStorage.getStore();
    const meta = { requestId: store?.requestId ?? 'unknown', ipAddress: store?.ip, userAgent: store?.userAgent };
    try {
      const security = await this.auth.resolveSecurityContext(token, meta);
      if (store) store.security = security;
      (request as any).user = security;
      return true;
    } catch (e) {
      throw new UnauthorizedException((e as Error).message);
    }
  }
}
