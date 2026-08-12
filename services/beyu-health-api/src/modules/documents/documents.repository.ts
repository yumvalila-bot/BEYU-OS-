import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class DocumentsRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext, query: { patientId?: string; documentType?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = ["d.status != 'DELETED'"]; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('d.patient_id = ?', query.patientId);
    if (query.documentType) add('d.document_type = ?', query.documentType);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('d.tenant_id = ?', security.tenantId);
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_documents.documents d ${clause}`, params);
      const rows = await session.query(`SELECT d.* FROM health_documents.documents d ${clause} ORDER BY d.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async create(security: HealthSecurityContext, input: { patientId?: string; encounterId?: string; documentType: string; title: string; storageKey?: string; mimeType?: string; sizeBytes?: number; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_documents.documents (tenant_id, owner_id, patient_id, encounter_id, document_type, title, storage_key, mime_type, size_bytes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [tenantId, security.userId, input.patientId ?? null, input.encounterId ?? null, input.documentType, input.title, input.storageKey ?? null, input.mimeType ?? null, input.sizeBytes ?? null, security.userId]);
      return (await session.query(`SELECT * FROM health_documents.documents WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'document', resourceId: (result as any).id, newState: result as any }));
  }
  async getById(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT * FROM health_documents.documents WHERE id=$1 AND status != 'DELETED'`, [id]);
      if (!r.rows[0]) notFound('document', id);
      await session.query(`INSERT INTO health_documents.document_access_log (document_id, user_id, action) VALUES ($1,$2,'VIEW')`, [id, security.userId]);
      return r.rows[0];
    });
  }
}
