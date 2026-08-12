import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class TelemedicineRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext, query: { patientId?: string; practitionerId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('s.patient_id = ?', query.patientId);
    if (query.practitionerId) add('s.practitioner_id = ?', query.practitionerId);
    if (query.status) add('s.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('s.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_telemedicine.telemedicine_sessions s ${clause}`, params);
      const rows = await session.query(`SELECT s.*, p.first_name, p.last_name, u.display_name as practitioner_name FROM health_telemedicine.telemedicine_sessions s JOIN health_patient.patients p ON p.id=s.patient_id JOIN health_identity.users u ON u.id=s.practitioner_id ${clause} ORDER BY s.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async create(security: HealthSecurityContext, input: { appointmentId: string; patientId: string; practitionerId: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const sessionNumber = `TMD-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const joinUrl = `https://health.beyu.africa/telemed/${sessionNumber}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_telemedicine.telemedicine_sessions (tenant_id, appointment_id, patient_id, practitioner_id, session_number, join_url, practitioner_join_url, patient_join_url, room_id) VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$5) RETURNING id`,
        [tenantId, input.appointmentId, input.patientId, input.practitionerId, sessionNumber, joinUrl]);
      return (await session.query(`SELECT * FROM health_telemedicine.telemedicine_sessions WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'telemedicine_session', resourceId: (result as any).id, newState: result as any }));
  }
  async updateStatus(security: HealthSecurityContext, id: string, status: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_telemedicine.telemedicine_sessions WHERE id=$1`, [id]);
      if (!existing.rows[0]) notFound('telemedicine_session', id);
      const res = await session.query(`UPDATE health_telemedicine.telemedicine_sessions SET status=$1, ${status==='IN_PROGRESS' ? 'started_at=now(),' : status==='COMPLETED' ? 'ended_at=now(),' : ''} updated_at=now() WHERE id=$2 RETURNING *`, [status, id]);
      return res.rows[0];
    }, (result) => ({ action: 'UPDATE', resourceType: 'telemedicine_session', resourceId: id, newState: result as any }));
  }
}
