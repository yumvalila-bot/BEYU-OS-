import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import type { AgriSecurityContext } from '../../common/security';

export interface AgriUserRecord {
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

const USER_COLUMNS = 'id, identity_id, email, display_name, password_hash, status, mfa_enabled, locked_until, failed_logins';

function mapUser(row: any): AgriUserRecord {
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

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<AgriUserRecord | null> {
    const r = await this.db.query<any>(
      `SELECT ${USER_COLUMNS} FROM agri_identity.users WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1`,
      [email],
    );
    return r.rows[0] ? mapUser(r.rows[0]) : null;
  }

  async findById(id: string): Promise<AgriUserRecord | null> {
    const r = await this.db.query<any>(
      `SELECT ${USER_COLUMNS} FROM agri_identity.users WHERE id=$1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return r.rows[0] ? mapUser(r.rows[0]) : null;
  }

  async recordFailedLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE agri_identity.users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins >= 4 THEN now() + interval '15 minutes' ELSE locked_until END, updated_at = now() WHERE id=$1`,
      [userId],
    );
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE agri_identity.users SET failed_logins=0, locked_until=NULL, last_login_at=now(), updated_at=now() WHERE id=$1`,
      [userId],
    );
  }

  async findLiveSessionByRefreshHash(hash: string): Promise<SessionRecord | null> {
    const r = await this.db.query<any>(
      `SELECT id, user_id, refresh_token_hash, mfa_satisfied, expires_at, revoked_at FROM agri_identity.sessions WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
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
      `INSERT INTO agri_identity.sessions (user_id, refresh_token_hash, mfa_satisfied, ip_address, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, hash, mfaSatisfied, meta.ipAddress ?? null, meta.userAgent ?? null, expiresAt.toISOString()],
    );
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE agri_identity.sessions SET revoked_at=now() WHERE id=$1`, [sessionId]);
  }

  async createUser(input: { email: string; displayName: string; passwordHash: string; roles?: string[]; tenantId?: string | null; farmId?: string | null; identityId?: string | null }): Promise<AgriUserRecord> {
    return this.db.transaction(async (session) => {
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_identity.users (identity_id, email, display_name, password_hash, status, mfa_enabled)
         VALUES ($1, $2, $3, $4, 'ACTIVE', false) RETURNING id`,
        [input.identityId ?? null, input.email, input.displayName, input.passwordHash],
      );
      const userId = res.rows[0].id;
      if (input.roles?.length) {
        for (const code of input.roles) {
          await session.query(
            `INSERT INTO agri_identity.user_roles (user_id, role_id) SELECT $1, id FROM agri_identity.roles WHERE code=$2 ON CONFLICT DO NOTHING`,
            [userId, code],
          );
        }
      }
      if (input.tenantId) {
        await session.query(
          `INSERT INTO agri_identity.memberships (user_id, tenant_id, farm_id, role_in_tenant, status) VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE') ON CONFLICT DO NOTHING`,
          [userId, input.tenantId, input.farmId ?? null],
        );
      }
      const row = await session.query<any>(`SELECT ${USER_COLUMNS} FROM agri_identity.users WHERE id=$1`, [userId]);
      return mapUser(row.rows[0]);
    });
  }

  async buildSecurityContext(user: AgriUserRecord, opts: { requestId: string; activeTenantId?: string | null; mfaSatisfied: boolean; ipAddress?: string | null; issuedAt?: number; expiresAt?: number }): Promise<AgriSecurityContext> {
    const rolesRes = await this.db.query<{ code: string }>(
      `SELECT r.code FROM agri_identity.user_roles ur JOIN agri_identity.roles r ON r.id=ur.role_id WHERE ur.user_id=$1`,
      [user.id],
    );
    const roles = rolesRes.rows.map(r => r.code);

    const membershipRes = await this.db.query<{ tenant_id: string; farm_id: string | null }>(
      `SELECT tenant_id, farm_id FROM agri_identity.memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 5`,
      [user.id],
    );
    const firstMembership = membershipRes.rows[0];
    const tenantId = firstMembership?.tenant_id ?? opts.activeTenantId ?? null;

    const permsRes = await this.db.query<{ resource_type: string; action: string }>(
      `SELECT p.resource_type, p.action FROM agri_identity.user_roles ur JOIN agri_identity.roles r ON r.id=ur.role_id JOIN agri_identity.role_permissions rp ON rp.role_id=r.id JOIN agri_identity.permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1`,
      [user.id],
    );
    const permissions = permsRes.rows.map(r => ({ resource: r.resource_type, action: r.action }));

    const farmIds = membershipRes.rows.map(m => m.farm_id).filter(Boolean) as string[];

    return {
      userId: user.id,
      identityId: user.identityId,
      email: user.email,
      displayName: user.displayName,
      tenantId,
      farmIds,
      roles,
      permissions,
      activeTenantId: opts.activeTenantId ?? null,
      mfaSatisfied: opts.mfaSatisfied,
      isServiceAccount: false,
      requestId: opts.requestId,
      ipAddress: opts.ipAddress ?? null,
    };
  }
}
