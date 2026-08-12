import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { loadConfig } from '@beyu/config';
import { hashPassword, signJwt, verifyJwt, verifyPassword, generateToken } from '@beyu/security';
import { UserRepository, type HealthUserRecord } from './user.repository';
import { AuditRepository } from '../audit/audit.repository';
import type { HealthSecurityContext } from '../../common/security';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: { id: string; email: string; displayName: string; roles: string[]; activeTenantId: string | null; mfaRequired: boolean };
}
export interface RequestMeta { requestId: string; ipAddress?: string | null; userAgent?: string | null; }
const GENERIC_FAILURE = 'Invalid email or password.';
@Injectable()
export class AuthService {
  constructor(@Inject(UserRepository) private readonly users: UserRepository, @Inject(AuditRepository) private readonly audit: AuditRepository) {}
  async login(email: string, password: string, meta: RequestMeta, requestedTenantId?: string | null): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash) throw new UnauthorizedException(GENERIC_FAILURE);
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new UnauthorizedException('Account temporarily locked');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException(GENERIC_FAILURE);
    if (!verifyPassword(password, user.passwordHash)) { await this.users.recordFailedLogin(user.id); throw new UnauthorizedException(GENERIC_FAILURE); }
    await this.users.recordSuccessfulLogin(user.id);
    const mfaSatisfied = !user.mfaEnabled;
    return this.issue(user, meta, mfaSatisfied, requestedTenantId ?? null, 'LOGIN');
  }
  async refresh(refreshToken: string, meta: RequestMeta): Promise<LoginResult> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.users.findLiveSessionByRefreshHash(hash);
    if (!session) throw new UnauthorizedException('Invalid refresh token');
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid refresh token');
    await this.users.revokeSession(session.id);
    return this.issue(user, meta, session.mfaSatisfied, null, 'TOKEN_REFRESH');
  }
  async logout(refreshToken: string): Promise<void> {
    const session = await this.users.findLiveSessionByRefreshHash(hashRefreshToken(refreshToken));
    if (!session) return;
    await this.users.revokeSession(session.id);
  }
  async resolveSecurityContext(token: string, meta: RequestMeta): Promise<HealthSecurityContext> {
    const config = loadConfig();
    const verification = verifyJwt(token, config.jwtSecret, config.jwtIssuer);
    if (!verification.valid) throw new UnauthorizedException(`Invalid token: ${verification.reason}`);
    const claims = verification.claims;
    const user = await this.users.findById(String(claims.sub));
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account not active');
    return this.users.buildSecurityContext(user, {
      requestId: meta.requestId,
      activeTenantId: typeof claims.activeTenant === 'string' ? claims.activeTenant : null,
      mfaSatisfied: (claims as any).mfa === true,
      ipAddress: meta.ipAddress ?? null,
      issuedAt: (claims.iat ?? 0) * 1000,
      expiresAt: (claims.exp ?? 0) * 1000,
    });
  }
  private async issue(user: HealthUserRecord, meta: RequestMeta, mfaSatisfied: boolean, requestedTenantId: string | null, action: string): Promise<LoginResult> {
    const config = loadConfig();
    const context = await this.users.buildSecurityContext(user, { requestId: meta.requestId, activeTenantId: requestedTenantId, mfaSatisfied, ipAddress: meta.ipAddress });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: user.id,
        iss: config.jwtIssuer,
        aud: 'beyu-health-os',
        email: user.email,
        activeTenant: context.activeTenantId ?? context.tenantId,
        roles: context.roles,
        mfa: mfaSatisfied,
        iat: nowSeconds,
        exp: nowSeconds + config.accessTokenTtlSeconds,
      } as any,
      config.jwtSecret,
    );
    const refreshToken = generateToken(48);
    const hash = hashRefreshToken(refreshToken);
    await this.users.createSession(user.id, hash, mfaSatisfied, meta, new Date(Date.now() + config.refreshTokenTtlSeconds * 1000));
    await this.audit.append({
      actorUserId: user.id,
      tenantId: context.activeTenantId ?? context.tenantId,
      action,
      resourceType: 'session',
      resourceId: user.id,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSeconds,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: context.roles,
        activeTenantId: context.activeTenantId ?? context.tenantId,
        mfaRequired: user.mfaEnabled && !mfaSatisfied,
      },
    };
  }
}
function hashRefreshToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
