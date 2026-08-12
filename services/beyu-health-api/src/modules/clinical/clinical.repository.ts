import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class ClinicalRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async listEncounters(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('e.patient_id = ?', query.patientId);
    if (query.status) add('e.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('e.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_clinical.encounters e ${clause}`, params);
      const rows = await session.query(`SELECT e.id, e.patient_id, e.facility_id, e.class, e.status, e.type, e.reason, e.period_start, e.period_end, p.first_name, p.last_name FROM health_clinical.encounters e JOIN health_patient.patients p ON p.id=e.patient_id ${clause} ORDER BY e.period_start DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createEncounter(security: HealthSecurityContext, input: { patientId: string; facilityId: string; departmentId?: string; practitionerId?: string; class: string; type?: string; reason?: string; priority?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_clinical.encounters (tenant_id, patient_id, facility_id, department_id, practitioner_id, class, type, reason, priority, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [tenantId, input.patientId, input.facilityId, input.departmentId ?? null, input.practitionerId ?? security.userId, input.class, input.type ?? null, input.reason ?? null, input.priority ?? 'ROUTINE', security.userId]);
      const encounter = await session.query(`SELECT * FROM health_clinical.encounters WHERE id=$1`, [res.rows[0].id]);
      return encounter.rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'encounter', resourceId: (result as any).id, newState: result as any }));
  }

  async getEncounter(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const r = await session.query(
        `SELECT e.*, p.first_name, p.last_name, p.mrn, f.name as facility_name FROM health_clinical.encounters e JOIN health_patient.patients p ON p.id=e.patient_id JOIN health_tenant.facilities f ON f.id=e.facility_id WHERE e.id=$1`,
        [id],
      );
      if (!r.rows[0]) notFound('encounter', id);
      const [notes, vitals, conditions, procedures] = await Promise.all([
        session.query(`SELECT * FROM health_clinical.clinical_notes WHERE encounter_id=$1 ORDER BY created_at DESC`, [id]),
        session.query(`SELECT * FROM health_clinical.vital_signs WHERE encounter_id=$1 ORDER BY recorded_at DESC`, [id]),
        session.query(`SELECT * FROM health_clinical.conditions WHERE encounter_id=$1`, [id]),
        session.query(`SELECT * FROM health_clinical.procedures WHERE encounter_id=$1`, [id]),
      ]);
      return { ...r.rows[0], notes: notes.rows, vitals: vitals.rows, conditions: conditions.rows, procedures: procedures.rows };
    });
  }

  async createNote(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; type: string; title: string; content: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_clinical.clinical_notes (tenant_id, patient_id, encounter_id, author_id, type, title, content, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'FINAL') RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, security.userId, input.type, input.title, input.content]);
      const note = await session.query(`SELECT * FROM health_clinical.clinical_notes WHERE id=$1`, [res.rows[0].id]);
      return note.rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'clinical_note', resourceId: (result as any).id, newState: result as any }));
  }

  async createObservation(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; code: string; display: string; valueQuantity?: number; valueUnit?: string; valueString?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_clinical.observations (tenant_id, patient_id, encounter_id, code, display, value_quantity, value_unit, value_string, performer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, input.code, input.display, input.valueQuantity ?? null, input.valueUnit ?? null, input.valueString ?? null, security.userId]);
      return (await session.query(`SELECT * FROM health_clinical.observations WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'observation', resourceId: (result as any).id, newState: result as any }));
  }

  async vitalSigns(security: HealthSecurityContext, patientId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_clinical.vital_signs WHERE patient_id=$1 ORDER BY recorded_at DESC LIMIT 50`, [patientId]);
      return rows.rows;
    });
  }

  async createVital(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; type: string; value: number; unit: string; systolic?: number; diastolic?: number; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_clinical.vital_signs (tenant_id, patient_id, encounter_id, type, value, unit, systolic, diastolic, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, input.type, input.value, input.unit, input.systolic ?? null, input.diastolic ?? null, security.userId]);
      return (await session.query(`SELECT * FROM health_clinical.vital_signs WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'vital_sign', resourceId: (result as any).id, newState: result as any }));
  }
}
