import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database, DatabaseSession } from '../../db/driver';
import { createHash, randomUUID } from 'node:crypto';

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
  facilityId?: string | null;
}

@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async append(input: AppendAuditInput, session?: DatabaseSession): Promise<void> {
    const exec = session ?? { query: (sql: string, params?: unknown[]) => this.db.query(sql, params) };
    // Compute tamper-evident hash chain in application layer (Node SHA256) for production safety
    // Try to get previous hash
    let prevHash = '0'.repeat(64);
    let prevIndex = 0;
    try {
      const prev = await exec.query<{ hash: string; chain_index: string }>(
        `SELECT hash, chain_index FROM health_audit.audit_events WHERE tenant_id = $1 ORDER BY chain_index DESC, created_at DESC LIMIT 1`,
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
      `INSERT INTO health_audit.audit_events 
       (id, tenant_id, user_id, action, resource_type, resource_id, facility_id, before_state, after_state, reason, purpose_of_use, ip_address, user_agent, created_at, hash, previous_hash, chain_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        input.tenantId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.facilityId ?? null,
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
    // Access log for patient-related
    if ((input.newState as any)?.patientId || input.resourceType === 'patient') {
      await exec.query(
        `INSERT INTO health_audit.access_logs (tenant_id, user_id, patient_id, resource_type, resource_id, action, purpose_of_use, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.tenantId ?? '00000000-0000-0000-0000-000000000001',
          input.actorUserId ?? '00000000-0000-0000-0000-000000000000',
          (input.newState as any)?.patientId ?? (input.resourceType === 'patient' ? input.resourceId : null),
          input.resourceType,
          input.resourceId,
          input.action === 'CREATE' ? 'CREATE' : input.action === 'UPDATE' ? 'UPDATE' : input.action === 'DELETE' ? 'DELETE' : 'READ',
          input.purposeOfUse,
          input.ipAddress,
          input.userAgent,
        ],
      ).catch(() => {});
    }
  }

  async list(tenantId: string | null, query: { resourceType?: string; resourceId?: string; userId?: string; limit?: number; offset?: number; order?: 'asc' | 'desc' }) {
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const offset = Math.max(0, Number(query.offset ?? 0));
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };
    if (tenantId) add('tenant_id = ?', tenantId);
    if (query.resourceType) add('resource_type = ?', query.resourceType);
    if (query.resourceId) add('resource_id = ?', query.resourceId);
    if (query.userId) add('user_id = ?', query.userId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT id, tenant_id, user_id, action, resource_type, resource_id, facility_id, before_state, after_state, reason, purpose_of_use, ip_address, created_at, hash, previous_hash, chain_index
       FROM health_audit.audit_events ${clause} ORDER BY created_at ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await this.db.query<{ count: string }>(`SELECT count(*)::text as count FROM health_audit.audit_events ${clause}`, params);
    return { items: result.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
  }
}
