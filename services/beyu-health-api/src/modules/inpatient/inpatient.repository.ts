import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class InpatientRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async admissions(security: HealthSecurityContext, query: { facilityId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.facilityId) add('a.facility_id = ?', query.facilityId);
    if (query.status) add('a.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('a.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_scheduling.admissions a ${clause}`, params);
      const rows = await session.query(`SELECT a.*, p.first_name, p.last_name, b.bed_number, f.name as facility_name FROM health_scheduling.admissions a JOIN health_patient.patients p ON p.id=a.patient_id LEFT JOIN health_tenant.beds b ON b.id=a.bed_id JOIN health_tenant.facilities f ON f.id=a.facility_id ${clause} ORDER BY a.admitted_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async admit(security: HealthSecurityContext, input: { patientId: string; encounterId: string; facilityId: string; departmentId?: string; bedId?: string; admissionType?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_scheduling.admissions (tenant_id, patient_id, encounter_id, facility_id, department_id, bed_id, admission_type, admitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, input.patientId, input.encounterId, input.facilityId, input.departmentId ?? null, input.bedId ?? null, input.admissionType ?? 'ROUTINE', security.userId]);
      if (input.bedId) await session.query(`UPDATE health_tenant.beds SET status='OCCUPIED', patient_id=$1 WHERE id=$2`, [input.patientId, input.bedId]);
      return (await session.query(`SELECT * FROM health_scheduling.admissions WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'admission', resourceId: (result as any).id, newState: result as any }));
  }
  async discharge(security: HealthSecurityContext, admissionId: string, summary: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_scheduling.admissions WHERE id=$1`, [admissionId]);
      const admission = existing.rows[0];
      if (!admission) { const e: any = new Error('Admission not found'); e.status=404; throw e; }
      if (admission.bed_id) await session.query(`UPDATE health_tenant.beds SET status='CLEANING', patient_id=NULL WHERE id=$1`, [admission.bed_id]);
      const res = await session.query(`UPDATE health_scheduling.admissions SET status='DISCHARGED', discharge_at=now(), discharged_by=$1, discharge_summary=$2 WHERE id=$3 RETURNING *`, [security.userId, summary, admissionId]);
      await session.query(`UPDATE health_clinical.encounters SET status='DISCHARGED', period_end=now() WHERE id=$1`, [admission.encounter_id]);
      return res.rows[0];
    }, (result) => ({ action: 'UPDATE', resourceType: 'admission', resourceId: admissionId, newState: result as any }));
  }
  async beds(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT b.*, r.name as room_name FROM health_tenant.beds b LEFT JOIN health_tenant.rooms r ON r.id=b.room_id WHERE b.facility_id=$1 ORDER BY b.bed_number`, [facilityId]);
      return rows.rows;
    });
  }
}
