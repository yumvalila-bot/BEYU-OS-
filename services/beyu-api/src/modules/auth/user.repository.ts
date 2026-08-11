/**
 * Identity persistence (spec §17, §55).
 *
 * Resolves the full security context a request is evaluated against: the user,
 * their roles, tenant memberships, organizational scope and classification
 * ceiling. Nothing here is derived from client input.
 */

import { permissionsForRoles } from '@beyu/auth';
import { loadConfig } from '@beyu/config';
import { type DataClassification, OsId, Role, type SecurityContext } from '@beyu/types';

import type { Database, DatabaseSession } from '../../db/driver';

export interface UserRecord {
  id: string;
  identityId: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'DISABLED';
  mfaEnabled: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
  isServiceAccount: boolean;
  maxClassification: DataClassification;
}

export interface UserScope {
  roles: Role[];
  tenantIds: string[];
  organizationIds: string[];
  countryCodes: string[];
  osIds: OsId[];
}

/** Failed attempts before an account is temporarily locked. */
export const MAX_FAILED_LOGINS = 5;
/** How long an account stays locked once the threshold is reached. */
export const LOCKOUT_MINUTES = 15;

function toUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    identityId: String(row.identity_id),
    email: String(row.email),
    displayName: String(row.display_name),
    passwordHash: row.password_hash === null ? null : String(row.password_hash),
    status: row.status as UserRecord['status'],
    mfaEnabled: Boolean(row.mfa_enabled),
    failedLogins: Number(row.failed_logins ?? 0),
    lockedUntil: row.locked_until ? new Date(String(row.locked_until)) : null,
    isServiceAccount: Boolean(row.is_service_account),
    maxClassification: row.max_classification as DataClassification,
  };
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  /** Case-insensitive lookup; email is an identifier, not a display value. */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.db.query(
      `SELECT * FROM identity.users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await this.db.query(`SELECT * FROM identity.users WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  /**
   * Loads everything that scopes a principal's authority. Expired role grants
   * are excluded here rather than filtered later, so an expired role can never
   * reach the policy engine.
   */
  async loadScope(userId: string): Promise<UserScope> {
    const roles = await this.db.query(
      `SELECT r.code, ur.tenant_id, ur.org_node_id, ur.country_code, ur.os_id
         FROM identity.user_roles ur
         JOIN identity.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
      [userId],
    );

    const memberships = await this.db.query(
      `SELECT tenant_id, org_node_id
         FROM identity.memberships
        WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId],
    );

    const tenantIds = new Set<string>();
    const organizationIds = new Set<string>();
    const countryCodes = new Set<string>();
    const osIds = new Set<OsId>();
    const roleCodes = new Set<Role>();

    for (const row of roles.rows) {
      const code = String(row.code);
      // Only recognised roles are honoured. An unknown code in the database
      // grants nothing rather than being trusted blindly.
      if ((Object.values(Role) as string[]).includes(code)) {
        roleCodes.add(code as Role);
      }
      if (row.tenant_id) tenantIds.add(String(row.tenant_id));
      if (row.org_node_id) organizationIds.add(String(row.org_node_id));
      if (row.country_code) countryCodes.add(String(row.country_code));
      if (row.os_id && (Object.values(OsId) as string[]).includes(String(row.os_id))) {
        osIds.add(String(row.os_id) as OsId);
      }
    }

    for (const row of memberships.rows) {
      if (row.tenant_id) tenantIds.add(String(row.tenant_id));
      if (row.org_node_id) organizationIds.add(String(row.org_node_id));
    }

    // Every principal authenticated here is, by definition, reaching BEYU OS.
    // Access to any other OS must be granted explicitly.
    osIds.add(OsId.BeyuOs);

    return {
      roles: [...roleCodes],
      tenantIds: [...tenantIds],
      organizationIds: [...organizationIds],
      countryCodes: [...countryCodes],
      osIds: [...osIds],
    };
  }

  /**
   * Assembles the security context the policy engine evaluates.
   *
   * Permissions are expanded from roles here, because `authorize()` matches
   * against `context.permissions` rather than re-deriving them. Direct
   * per-user grants are a deliberate non-feature: authority comes from a role
   * so it can be reviewed and revoked coherently.
   */
  async buildSecurityContext(
    user: UserRecord,
    options: {
      requestId: string;
      activeTenantId?: string | null;
      mfaSatisfied: boolean;
      ipAddress?: string | null;
      /** Epoch milliseconds. The policy engine rejects an expired context. */
      issuedAt?: number;
      expiresAt?: number;
    },
  ): Promise<SecurityContext> {
    const scope = await this.loadScope(user.id);

    // An explicitly requested tenant is honoured only if the user actually
    // holds it. Otherwise fall back to their sole tenant, or none.
    let activeTenantId: string | null = null;
    if (options.activeTenantId && scope.tenantIds.includes(options.activeTenantId)) {
      activeTenantId = options.activeTenantId;
    } else if (scope.tenantIds.length === 1) {
      activeTenantId = scope.tenantIds[0];
    }

    return {
      userId: user.id,
      identityId: user.identityId,
      email: user.email,
      displayName: user.displayName,
      roles: scope.roles,
      permissions: permissionsForRoles(scope.roles),
      tenantIds: scope.tenantIds,
      activeTenantId,
      organizationIds: scope.organizationIds,
      osIds: scope.osIds,
      countryCodes: scope.countryCodes,
      maxClassification: user.maxClassification,
      mfaSatisfied: options.mfaSatisfied,
      isServiceAccount: user.isServiceAccount,
      requestId: options.requestId,
      ipAddress: options.ipAddress ?? null,
      issuedAt: options.issuedAt ?? Date.now(),
      // Defaults to the access-token lifetime so a context built outside a
      // token exchange still expires rather than living forever.
      expiresAt: options.expiresAt ?? Date.now() + loadConfig().accessTokenTtlSeconds * 1000,
    };
  }

  /** Records a failed attempt and locks the account at the threshold. */
  async recordFailedLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE identity.users
          SET failed_logins = failed_logins + 1,
              locked_until = CASE
                WHEN failed_logins + 1 >= $2
                THEN now() + ($3 || ' minutes')::interval
                ELSE locked_until
              END,
              updated_at = now()
        WHERE id = $1`,
      [userId, MAX_FAILED_LOGINS, String(LOCKOUT_MINUTES)],
    );
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE identity.users
          SET failed_logins = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
        WHERE id = $1`,
      [userId],
    );
  }

  // --- sessions ------------------------------------------------------------

  async createSession(
    input: {
      userId: string;
      refreshTokenHash: string;
      mfaSatisfied: boolean;
      expiresAt: Date;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    session?: DatabaseSession,
  ): Promise<string> {
    const runner = session ?? this.db;
    const result = await runner.query(
      `INSERT INTO identity.sessions
         (user_id, refresh_token_hash, mfa_satisfied, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.userId,
        input.refreshTokenHash,
        input.mfaSatisfied,
        input.expiresAt.toISOString(),
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
    return String(result.rows[0].id);
  }

  /** Looks up a live session by refresh-token hash. Never by raw token. */
  async findLiveSessionByRefreshHash(
    hash: string,
  ): Promise<{ id: string; userId: string; mfaSatisfied: boolean } | null> {
    const result = await this.db.query(
      `SELECT id, user_id, mfa_satisfied
         FROM identity.sessions
        WHERE refresh_token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1`,
      [hash],
    );
    const row = result.rows[0];
    return row
      ? { id: String(row.id), userId: String(row.user_id), mfaSatisfied: Boolean(row.mfa_satisfied) }
      : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE identity.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE identity.sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return result.rowCount;
  }
}
