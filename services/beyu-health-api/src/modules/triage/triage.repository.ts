import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class TriageRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext, query: { facilityId?: string; category?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.facilityId) add('t.facility_id = ?', query.facilityId);
    if (query.category) add('t.category = ?', query.category);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('t.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_scheduling.triage t ${clause}`, params);
      const rows = await session.query(`SELECT t.*, p.first_name, p.last_name FROM health_scheduling.triage t JOIN health_patient.patients p ON p.id=t.patient_id ${clause} ORDER BY t.assessed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async create(security: HealthSecurityContext, input: { patientId: string; encounterId: string; facilityId: string; category: string; chiefComplaint: string; vitalSigns?: any; acuityScore?: number; notes?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_scheduling.triage (tenant_id, patient_id, encounter_id, facility_id, category, chief_complaint, vital_signs, acuity_score, assessed_by, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [tenantId, input.patientId, input.encounterId, input.facilityId, input.category, input.chiefComplaint, input.vitalSigns ? JSON.stringify(input.vitalSigns) : null, input.acuityScore ?? null, security.userId, input.notes ?? null]);
      return (await session.query(`SELECT * FROM health_scheduling.triage WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'triage', resourceId: (result as any).id, newState: result as any }));
  }
}
