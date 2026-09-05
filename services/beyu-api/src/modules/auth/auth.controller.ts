/**
 * Authentication endpoints (spec §17, §55).
 *
 * These are the only routes that may be reached without credentials, plus
 * `/auth/me`, which describes the caller to themselves.
 */

import { Body, Controller, Get, HttpCode, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { SecurityContext } from '@beyu/types';

import { Public } from '../../core/authorization.guard';
import { getRequestContext, getSecurityContext } from '../../core/request-context';
import { AuthService, type LoginResult } from './auth.service';
// NOTE: these MUST be value imports, not `import type`. The global
// ValidationPipe discovers the DTO class through the `design:paramtypes`
// metadata that the decorator emitter writes for `@Body() body: LoginDto`.
// A type-only import is erased at compile time, the metadata degrades to
// `Object`, and the pipe silently passes every request body through
// unvalidated. See the eslint override for this directory.
import { LoginDto, LogoutDto, RefreshDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private meta() {
    const context = getRequestContext();
    return {
      requestId: context?.requestId ?? 'unknown',
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    };
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchanges credentials for an access and refresh token pair.',
    description:
      'Failures are deliberately indistinguishable: an unknown account and a wrong ' +
      'password return the same message, so the endpoint cannot be used to enumerate users.',
  })
  async login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.auth.login(body.email, body.password, this.meta(), body.tenantId ?? null);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotates a refresh token for a new token pair.',
    description:
      'The presented token is consumed. Presenting it again is treated as compromise.',
  })
  async refresh(@Body() body: RefreshDto): Promise<LoginResult> {
    return this.auth.refresh(body.refreshToken, this.meta());
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revokes a refresh token. Idempotent.' })
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.auth.logout(body.refreshToken, this.meta());
  }

  @Get('me')
  @Public() // Reachable by any authenticated caller; it describes only themselves.
  @ApiOperation({ summary: 'Returns the caller’s own security context.' })
  me(): Omit<SecurityContext, 'permissions'> {
    const security = getSecurityContext();
    if (!security) {
      throw new UnauthorizedException('Authentication is required.');
    }
    // `permissions` is omitted: it is an internal derivation of roles, not a
    // contract clients should build against.
    const { permissions: _permissions, ...rest } = security;
    return rest;
  }
}
