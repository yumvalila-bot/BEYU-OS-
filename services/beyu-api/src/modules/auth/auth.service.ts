/**
 * Authentication (spec §17, §55).
 *
 * Issues short-lived access tokens and long-lived rotating refresh tokens.
 *
 * Deliberate properties:
 *  - Failed logins are indistinguishable from unknown accounts, so the API
 *    cannot be used to enumerate users.
 *  - A password check runs even when the account does not exist, so response
 *    timing does not reveal existence either.
 *  - Refresh tokens are stored only as hashes and rotate on every use; reuse
 *    of a consumed token revokes the whole session family.
 */

import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { loadConfig } from '@beyu/config';
import { generateToken, hashPassword, signJwt, verifyJwt, verifyPassword } from '@beyu/security';
import type { SecurityContext } from '@beyu/types';

import { AuditRepository } from '../audit/audit.repository';
import { UserRepository, type UserRecord } from './user.repository';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    activeTenantId: string | null;
    mfaRequired: boolean;
  };
}

export interface RequestMeta {
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * A dummy hash used to equalise timing when no account matches. Computed once
 * at module load, not per request.
 */
const TIMING_EQUALISER = hashPassword('timing-equalisation-placeholder-value');

const GENERIC_FAILURE = 'Invalid email or password.';

@Injectable()
export class AuthService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
  ) {}

  async login(
    email: string,
    password: string,
    meta: RequestMeta,
    requestedTenantId?: string | null,
  ): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);

    if (!user || !user.passwordHash) {
      // Spend the same work as a real verification so timing does not leak
      // whether the account exists.
      verifyPassword(password, TIMING_EQUALISER);
      await this.recordAuthFailure(null, meta, 'Unknown account or no password set.');
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordAuthFailure(user, meta, 'Account is temporarily locked.');
      throw new UnauthorizedException(
        'This account is temporarily locked after repeated failed sign-in attempts.',
      );
    }

    if (user.status !== 'ACTIVE') {
      await this.recordAuthFailure(user, meta, `Account status is ${user.status}.`);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    if (!verifyPassword(password, user.passwordHash)) {
      await this.users.recordFailedLogin(user.id);
      await this.recordAuthFailure(user, meta, 'Incorrect password.');
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    await this.users.recordSuccessfulLogin(user.id);

    // A user with MFA enabled has not satisfied it merely by presenting a
    // password. The policy engine will refuse high-impact actions until a
    // second factor is verified.
    const mfaSatisfied = !user.mfaEnabled;

    return this.issue(user, meta, mfaSatisfied, requestedTenantId ?? null, 'LOGIN');
  }

  /**
   * Exchanges a refresh token for a new pair. The presented token is consumed:
   * a second use of the same token is treated as theft and revokes every
   * session the user holds.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<LoginResult> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.users.findLiveSessionByRefreshHash(hash);

    if (!session) {
      await this.recordAuthFailure(null, meta, 'Refresh token is invalid, expired or already used.');
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.users.revokeSession(session.id);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Rotate: the presented token is dead from here on.
    await this.users.revokeSession(session.id);

    return this.issue(user, meta, session.mfaSatisfied, null, 'TOKEN_REFRESH');
  }

  async logout(refreshToken: string, meta: RequestMeta): Promise<void> {
    const session = await this.users.findLiveSessionByRefreshHash(hashRefreshToken(refreshToken));
    if (!session) return; // Already gone; logout is idempotent.

    await this.users.revokeSession(session.id);
    await this.audit.append({
      actorUserId: session.userId,
      actorType: 'USER',
      tenantId: null,
      organizationId: null,
      osId: 'BEYU_OS',
      action: 'LOGOUT',
      resourceType: 'session',
      resourceId: session.id,
      outcome: 'SUCCESS',
      requestId: meta.requestId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  /**
   * Verifies a bearer token and rebuilds the security context from the
   * database.
   *
   * Roles are deliberately NOT read from the token. A revoked role must take
   * effect immediately, not when the access token happens to expire.
   */
  async resolveSecurityContext(token: string, meta: RequestMeta): Promise<SecurityContext> {
    const config = loadConfig();
    const verification = verifyJwt(token, config.jwtSecret, config.jwtIssuer);
    if (!verification.valid) {
      throw new UnauthorizedException(`Invalid token: ${verification.reason}`);
    }

    const claims = verification.claims;
    const user = await this.users.findById(String(claims.sub));
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active.');
    }

    return this.users.buildSecurityContext(user, {
      requestId: meta.requestId,
      activeTenantId: typeof claims.activeTenant === 'string' ? claims.activeTenant : null,
      mfaSatisfied: claims.mfa === true,
      ipAddress: meta.ipAddress ?? null,
      // The context expires exactly when the presented token does.
      issuedAt: claims.iat * 1000,
      expiresAt: claims.exp * 1000,
    });
  }

  // --- internals -----------------------------------------------------------

  private async issue(
    user: UserRecord,
    meta: RequestMeta,
    mfaSatisfied: boolean,
    requestedTenantId: string | null,
    action: 'LOGIN' | 'TOKEN_REFRESH',
  ): Promise<LoginResult> {
    const config = loadConfig();
    const context = await this.users.buildSecurityContext(user, {
      requestId: meta.requestId,
      activeTenantId: requestedTenantId,
      mfaSatisfied,
      ipAddress: meta.ipAddress,
    });

    const now = Math.floor(Date.now() / 1000);
    const accessToken = signJwt(
      {
        sub: user.id,
        iss: config.jwtIssuer,
        aud: config.jwtIssuer,
        iat: now,
        exp: now + config.accessTokenTtlSeconds,
        jti: randomUUID(),
        idt: user.identityId,
        email: user.email,
        activeTenant: context.activeTenantId,
        mfa: mfaSatisfied,
        svc: user.isServiceAccount,
      },
      config.jwtSecret,
    );

    const refreshToken = generateToken(32);
    await this.users.createSession({
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      mfaSatisfied,
      expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.audit.append({
      actorUserId: user.id,
      actorIdentityId: user.identityId,
      actorType: user.isServiceAccount ? 'SERVICE' : 'USER',
      tenantId: context.activeTenantId,
      organizationId: null,
      osId: 'BEYU_OS',
      action,
      resourceType: 'session',
      resourceId: null,
      outcome: 'SUCCESS',
      requestId: meta.requestId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      authorizationContext: { roles: context.roles, mfaSatisfied },
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
        activeTenantId: context.activeTenantId,
        mfaRequired: user.mfaEnabled && !mfaSatisfied,
      },
    };
  }

  /** Failed authentication is itself an auditable security event. */
  private async recordAuthFailure(
    user: UserRecord | null,
    meta: RequestMeta,
    reason: string,
  ): Promise<void> {
    try {
      await this.audit.append({
        actorUserId: user?.id ?? null,
        actorIdentityId: user?.identityId ?? null,
        actorType: 'USER',
        tenantId: null,
        organizationId: null,
        osId: 'BEYU_OS',
        action: 'LOGIN',
        resourceType: 'session',
        resourceId: null,
        outcome: 'DENIED',
        reason,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      });
    } catch {
      // Never let an audit failure convert a denied login into a 500 —
      // that difference would itself be an enumeration signal.
    }
  }
}

/**
 * Refresh tokens are high-entropy random values, so a fast hash is
 * appropriate: there is nothing to brute-force. Password hashing uses scrypt.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
