import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import type { HealthSecurityContext } from '../../common/security';

export interface HealthUserRecord {
  id: string;
  identityId: string | null;
  email: string;
  displayName: string;
  passwordHash: string | null;
  status: string;
  mfaEnabled: boolean;
  lockedUntil: Date | null;
  failedLogins: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  mfaSatisfied: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
}

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<HealthUserRecord | null> {
    const r = await this.db.query<HealthUserRecord & { password_hash: string; display_name: string; mfa_enabled: boolean; locked_until: string | null; failed_logins: number; identity_id: string }>(
      `SELECT id, identity_id, email, display_name, password_hash, status, mfa_enabled, locked_until, failed_logins FROM health_identity.users WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1`,
      [email],
    );
    const row = (r.rows as any[])[0];
    if (!row) return null;
    return {
      id: row.id,
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      status: row.status,
      mfaEnabled: row.mfa_enabled,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
      failedLogins: row.failed_logins,
    };
  }

  async findById(id: string): Promise<HealthUserRecord | null> {
    const r = await this.db.query<any>(
      `SELECT id, identity_id, email, display_name, password_hash, status, mfa_enabled, locked_until, failed_logins FROM health_identity.users WHERE id=$1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      status: row.status,
      mfaEnabled: row.mfa_enabled,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
      failedLogins: row.failed_logins,
    };
  }

  async recordFailedLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE health_identity.users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins >= 4 THEN now() + interval '15 minutes' ELSE locked_until END, updated_at = now() WHERE id=$1`,
      [userId],
    );
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE health_identity.users SET failed_logins=0, locked_until=NULL, last_login_at=now(), updated_at=now() WHERE id=$1`,
      [userId],
    );
  }

  async findLiveSessionByRefreshHash(hash: string): Promise<SessionRecord | null> {
    const r = await this.db.query<any>(
      `SELECT id, user_id, refresh_token_hash, mfa_satisfied, expires_at, revoked_at FROM health_identity.sessions WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
      [hash],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      mfaSatisfied: row.mfa_satisfied,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
  }

  async createSession(userId: string, hash: string, mfaSatisfied: boolean, meta: { ipAddress?: string | null; userAgent?: string | null }, expiresAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO health_identity.sessions (user_id, refresh_token_hash, mfa_satisfied, ip_address, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, hash, mfaSatisfied, meta.ipAddress ?? null, meta.userAgent ?? null, expiresAt.toISOString()],
    );
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE health_identity.sessions SET revoked_at=now() WHERE id=$1`, [sessionId]);
  }

  async buildSecurityContext(user: HealthUserRecord, opts: { requestId: string; activeTenantId?: string | null; mfaSatisfied: boolean; ipAddress?: string | null; issuedAt?: number; expiresAt?: number }): Promise<HealthSecurityContext> {
    // Load roles and memberships
    const rolesRes = await this.db.query<{ code: string }>(
      `SELECT r.code FROM health_identity.user_roles ur JOIN health_identity.roles r ON r.id=ur.role_id WHERE ur.user_id=$1`,
      [user.id],
    );
    const roles = rolesRes.rows.map(r => r.code);

    const membershipRes = await this.db.query<{ tenant_id: string; facility_id: string | null }>(
      `SELECT tenant_id, facility_id FROM health_identity.memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 5`,
      [user.id],
    );
    const firstMembership = membershipRes.rows[0];
    const tenantId = firstMembership?.tenant_id ?? opts.activeTenantId ?? null;

    const permsRes = await this.db.query<{ resource_type: string; action: string }>(
      `SELECT p.resource_type, p.action FROM health_identity.user_roles ur JOIN health_identity.roles r ON r.id=ur.role_id JOIN health_identity.role_permissions rp ON rp.role_id=r.id JOIN health_identity.permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1`,
      [user.id],
    );
    const permissions = permsRes.rows.map(r => ({ resource: r.resource_type, action: r.action }));

    // If super admin, keep tenant null for cross-tenant access but use active tenant if requested
    const facilityIds = membershipRes.rows.map(m => m.facility_id).filter(Boolean) as string[];

    return {
      userId: user.id,
      identityId: user.identityId,
      email: user.email,
      displayName: user.displayName,
      tenantId: tenantId,
      facilityIds,
      roles: roles.length ? roles : ['PATIENT'],
      permissions,
      activeTenantId: opts.activeTenantId ?? tenantId,
      mfaSatisfied: opts.mfaSatisfied,
      isServiceAccount: false,
      requestId: opts.requestId,
      ipAddress: opts.ipAddress ?? undefined,
    };
  }

  async createUser(data: { email: string; displayName: string; passwordHash: string; roles?: string[]; tenantId?: string; facilityId?: string }): Promise<HealthUserRecord> {
    const idRes = await this.db.query<{ id: string }>(
      `INSERT INTO health_identity.users (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id`,
      [data.email, data.displayName, data.passwordHash],
    );
    const userId = idRes.rows[0].id;
    if (data.roles && data.roles.length) {
      for (const roleCode of data.roles) {
        await this.db.query(
          `INSERT INTO health_identity.user_roles (user_id, role_id, tenant_id, facility_id) SELECT $1, id, $2, $3 FROM health_identity.roles WHERE code=$4 ON CONFLICT DO NOTHING`,
          [userId, data.tenantId ?? null, data.facilityId ?? null, roleCode],
        );
      }
    }
    if (data.tenantId) {
      await this.db.query(`INSERT INTO health_identity.memberships (user_id, tenant_id, facility_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, data.tenantId, data.facilityId ?? null]);
    }
    const user = await this.findById(userId);
    return user!;
  }
}
