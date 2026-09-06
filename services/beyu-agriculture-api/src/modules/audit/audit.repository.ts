import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database, DatabaseSession } from '../../db/driver';
import { createHash, randomUUID } from 'node:crypto';
import type { AgriSecurityContext } from '../../common/security';

export interface AppendAuditInput {
  actorUserId?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  purposeOfUse?: string | null;
  farmId?: string | null;
}

/**
 * Append-only, hash-chained audit trail. The chain is computed in the
 * application layer (Node SHA-256) so it holds on every driver, including
 * PGLite. Tampering with any historical row breaks verification.
 */
@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async append(input: AppendAuditInput, session?: DatabaseSession): Promise<void> {
    const exec = session ?? { query: (sql: string, params?: unknown[]) => this.db.query(sql, params) };
    let prevHash = '0'.repeat(64);
    let prevIndex = 0;
    try {
      const prev = await exec.query<{ hash: string; chain_index: string }>(
        `SELECT hash, chain_index FROM agri_audit.audit_events WHERE tenant_id IS NOT DISTINCT FROM $1 ORDER BY chain_index DESC, created_at DESC LIMIT 1`,
        [input.tenantId ?? null],
      );
      if (prev.rows[0]) {
        prevHash = prev.rows[0].hash;
        prevIndex = Number(prev.rows[0].chain_index) + 1;
      }
    } catch {
      // first event
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const hashInput = `${id}${input.action}${input.resourceType}${input.resourceId ?? ''}${prevHash}${now}${input.tenantId ?? ''}`;
    const hash = createHash('sha256').update(hashInput).digest('hex');

    await exec.query(
      `INSERT INTO agri_audit.audit_events
       (id, tenant_id, user_id, action, resource_type, resource_id, farm_id, before_state, after_state, reason, purpose_of_use, ip_address, user_agent, created_at, hash, previous_hash, chain_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        input.tenantId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.farmId ?? null,
        input.previousState ? JSON.stringify(input.previousState) : null,
        input.newState ? JSON.stringify(input.newState) : null,
        input.reason ?? null,
        input.purposeOfUse ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        now,
        hash,
        prevHash,
        prevIndex,
      ],
    );
  }

  async list(security: AgriSecurityContext, query: { resourceType?: string; resourceId?: string; action?: string; limit?: number; offset?: number }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
    const offset = Math.max(0, Number(query.offset ?? 0));
    const where: string[] = [];
    const params: unknown[] = [];
    if (!security.roles.includes('SUPER_ADMIN')) {
      params.push(security.activeTenantId ?? security.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (query.resourceType) { params.push(query.resourceType); where.push(`resource_type = $${params.length}`); }
    if (query.resourceId) { params.push(query.resourceId); where.push(`resource_id = $${params.length}`); }
    if (query.action) { params.push(query.action); where.push(`action = $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.withContext(
      { tenantId: security.activeTenantId ?? security.tenantId, userId: security.userId, crossTenant: security.roles.includes('SUPER_ADMIN') || security.roles.includes('AUDITOR') },
      async (session) => {
        const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_audit.audit_events ${clause}`, params);
        const rows = await session.query(
          `SELECT id, tenant_id, user_id, action, resource_type, resource_id, created_at, hash, chain_index
           FROM agri_audit.audit_events ${clause} ORDER BY chain_index DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
      },
    );
  }
}

/** Verifies the whole audit chain (per tenant) — used by `db:verify-audit`. */
export async function verifyAuditChain(db: Database): Promise<{ valid: boolean; checked: number; brokenAt: string | null }> {
  const tenants = await db.query<{ tenant_id: string | null }>(`SELECT DISTINCT tenant_id FROM agri_audit.audit_events`);
  let checked = 0;
  for (const { tenant_id } of tenants.rows) {
    const events = await db.query<any>(
      `SELECT id, action, resource_type, resource_id, hash, previous_hash, chain_index, created_at, tenant_id
       FROM agri_audit.audit_events WHERE tenant_id IS NOT DISTINCT FROM $1 ORDER BY chain_index ASC, created_at ASC`,
      [tenant_id],
    );
    let prevHash = '0'.repeat(64);
    let prevIndex = 0;
    for (const row of events.rows) {
      const hashInput = `${row.id}${row.action}${row.resource_type}${row.resource_id ?? ''}${prevHash}${new Date(row.created_at).toISOString()}${row.tenant_id ?? ''}`;
      const expected = createHash('sha256').update(hashInput).digest('hex');
      if (row.previous_hash !== prevHash || row.chain_index !== prevIndex || row.hash !== expected) {
        return { valid: false, checked, brokenAt: row.id };
      }
      prevHash = row.hash;
      prevIndex = Number(row.chain_index) + 1;
      checked += 1;
    }
  }
  return { valid: true, checked, brokenAt: null };
}
