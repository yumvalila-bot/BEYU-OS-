import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class RadiologyRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async orders(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('o.patient_id = ?', query.patientId);
    if (query.status) add('o.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('o.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_radiology.imaging_orders o ${clause}`, params);
      const rows = await session.query(`SELECT o.*, p.first_name, p.last_name FROM health_radiology.imaging_orders o JOIN health_patient.patients p ON p.id=o.patient_id ${clause} ORDER BY o.ordered_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createOrder(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; modality: string; bodySite?: string; indication?: string; priority?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const orderNumber = `IMG-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_radiology.imaging_orders (tenant_id, patient_id, encounter_id, orderer_id, order_number, modality, body_site, indication, priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, security.userId, orderNumber, input.modality, input.bodySite ?? null, input.indication ?? null, input.priority ?? 'ROUTINE']);
      return (await session.query(`SELECT * FROM health_radiology.imaging_orders WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'imaging_order', resourceId: (result as any).id, newState: result as any }));
  }

  async createStudy(security: HealthSecurityContext, orderId: string, input: { modality: string; bodySite?: string }) {
    return this.mutate(security, async (session) => {
      const order = await session.query(`SELECT * FROM health_radiology.imaging_orders WHERE id=$1`, [orderId]);
      if (!order.rows[0]) notFound('imaging_order', orderId);
      const res = await session.query<{ id: string }>(`INSERT INTO health_radiology.imaging_studies (tenant_id, order_id, patient_id, modality, body_site, performer_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [order.rows[0].tenant_id, orderId, order.rows[0].patient_id, input.modality, input.bodySite ?? null, security.userId]);
      await session.query(`UPDATE health_radiology.imaging_orders SET status='COMPLETED' WHERE id=$1`, [orderId]);
      return (await session.query(`SELECT * FROM health_radiology.imaging_studies WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'imaging_study', resourceId: (result as any).id, newState: result as any }));
  }

  async createReport(security: HealthSecurityContext, studyId: string, input: { findings: string; impression: string; conclusion?: string }) {
    return this.mutate(security, async (session) => {
      const study = await session.query(`SELECT * FROM health_radiology.imaging_studies WHERE id=$1`, [studyId]);
      if (!study.rows[0]) notFound('imaging_study', studyId);
      const res = await session.query<{ id: string }>(`INSERT INTO health_radiology.imaging_reports (tenant_id, study_id, order_id, patient_id, author_id, findings, impression, conclusion) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [study.rows[0].tenant_id, studyId, study.rows[0].order_id, study.rows[0].patient_id, security.userId, input.findings, input.impression, input.conclusion ?? null]);
      return (await session.query(`SELECT * FROM health_radiology.imaging_reports WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'imaging_report', resourceId: (result as any).id, newState: result as any }));
  }
}
