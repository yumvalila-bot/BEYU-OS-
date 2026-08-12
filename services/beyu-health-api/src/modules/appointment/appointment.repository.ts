import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound, conflict } from '../../common/errors';

@Injectable()
export class AppointmentRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async list(security: HealthSecurityContext, query: { patientId?: string; practitionerId?: string; facilityId?: string; date?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('a.patient_id = ?', query.patientId);
    if (query.practitionerId) add('a.practitioner_id = ?', query.practitionerId);
    if (query.facilityId) add('a.facility_id = ?', query.facilityId);
    if (query.status) add('a.status = ?', query.status);
    if (query.date) add('a.start::date = ?', query.date);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('a.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_scheduling.appointments a ${clause}`, params);
      const rows = await session.query(`SELECT a.*, p.first_name, p.last_name, p.mrn, u.display_name as practitioner_name FROM health_scheduling.appointments a JOIN health_patient.patients p ON p.id=a.patient_id LEFT JOIN health_identity.users u ON u.id=a.practitioner_id ${clause} ORDER BY a.start DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async create(security: HealthSecurityContext, input: { patientId: string; facilityId: string; practitionerId?: string; departmentId?: string; start: string; end: string; reason?: string; serviceType?: string; isTelemedicine?: boolean; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      // Check overlapping practitioner schedule
      if (input.practitionerId) {
        const overlap = await session.query(`SELECT 1 FROM health_scheduling.appointments WHERE practitioner_id=$1 AND status NOT IN ('CANCELLED','NOSHOW') AND tstzrange(start, "end") && tstzrange($2::timestamptz, $3::timestamptz) LIMIT 1`, [input.practitionerId, input.start, input.end]);
        if (overlap.rows.length) conflict('Practitioner has overlapping appointment');
      }
      const res = await session.query<{ id: string }>(`INSERT INTO health_scheduling.appointments (tenant_id, facility_id, department_id, patient_id, practitioner_id, start, "end", reason, service_type, is_telemedicine, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, input.facilityId, input.departmentId ?? null, input.patientId, input.practitionerId ?? null, input.start, input.end, input.reason ?? null, input.serviceType ?? null, input.isTelemedicine ?? false, security.userId]);
      return (await session.query(`SELECT * FROM health_scheduling.appointments WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'appointment', resourceId: (result as any).id, newState: result as any }));
  }

  async updateStatus(security: HealthSecurityContext, id: string, status: string, reason?: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_scheduling.appointments WHERE id=$1`, [id]);
      if (!existing.rows[0]) notFound('appointment', id);
      const res = await session.query(`UPDATE health_scheduling.appointments SET status=$1, cancellation_reason=$2, updated_at=now() WHERE id=$3 RETURNING *`, [status, reason ?? null, id]);
      return res.rows[0];
    }, (result) => ({ action: 'UPDATE', resourceType: 'appointment', resourceId: id, newState: result as any }));
  }

  async queues(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT q.id, q.name, q.code, q.type, (SELECT COUNT(*)::int FROM health_scheduling.queue_entries qe WHERE qe.queue_id=q.id AND qe.status='WAITING') as waiting_count FROM health_scheduling.queues q WHERE q.facility_id=$1 ORDER BY q.name`, [facilityId]);
      return rows.rows;
    });
  }
}
