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

  async list(security: HealthSecurityContext, query: { patientId?: string; documentType?: string; encounterId?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = ["d.status != 'DELETED'"]; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('d.patient_id = ?', query.patientId);
    if (query.documentType) add('d.document_type = ?', query.documentType);
    if (query.encounterId) add('d.encounter_id = ?', query.encounterId);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('d.tenant_id = ?', security.tenantId);
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_documents.documents d ${clause}`, params);
      const rows = await session.query(`SELECT d.*, u.display_name as creator_name FROM health_documents.documents d LEFT JOIN health_identity.users u ON u.id=d.created_by ${clause} ORDER BY d.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async create(security: HealthSecurityContext, input: { patientId?: string; encounterId?: string; documentType: string; title: string; description?: string; storageKey?: string; mimeType?: string; sizeBytes?: number; confidentiality?: string; tags?: string[] }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_documents.documents (tenant_id, owner_id, patient_id, encounter_id, document_type, title, description, storage_key, mime_type, size_bytes, confidentiality, tags, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [tenantId, security.userId, input.patientId ?? null, input.encounterId ?? null, input.documentType, input.title, input.description ?? null, input.storageKey ?? null, input.mimeType ?? null, input.sizeBytes ?? null, input.confidentiality ?? 'NORMAL', input.tags ?? [], security.userId]);
      return (await session.query(`SELECT * FROM health_documents.documents WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'document', resourceId: result.id, newState: result }));
  }

  async getById(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT d.*, u.display_name as creator_name FROM health_documents.documents d LEFT JOIN health_identity.users u ON u.id=d.created_by WHERE d.id=$1 AND d.status != 'DELETED'`, [id]);
      if (!r.rows[0]) notFound('document', id);
      await session.query(`INSERT INTO health_documents.document_access_log (document_id, user_id, action) VALUES ($1,$2,'VIEW')`, [id, security.userId]);
      return r.rows[0];
    });
  }

  async delete(security: HealthSecurityContext, id: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_documents.documents WHERE id=$1`, [id]);
      if (!existing.rows[0]) notFound('document', id);
      await session.query(`UPDATE health_documents.documents SET status='DELETED', deleted_at=now(), updated_at=now() WHERE id=$1`, [id]);
      return { id, deleted: true };
    }, () => ({ action: 'DELETE', resourceType: 'document', resourceId: id }));
  }

  async accessLog(security: HealthSecurityContext, documentId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT dal.*, u.display_name FROM health_documents.document_access_log dal JOIN health_identity.users u ON u.id=dal.user_id WHERE dal.document_id=$1 ORDER BY dal.accessed_at DESC LIMIT 50`, [documentId]);
      return rows.rows;
    });
  }
}
