import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, type Page, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound, badRequest } from '../../common/errors';

export interface CreatePatientInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  gender: string;
  dateOfBirth: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  address?: string;
  bloodGroup?: string;
  emergencyContacts?: Array<{ name: string; relationship: string; phone: string; isPrimary?: boolean }>;
  createdBy: string;
}

@Injectable()
export class PatientRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async list(security: HealthSecurityContext, query: { q?: string; limit?: number; offset?: number; status?: string }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['p.deleted_at IS NULL'];
    const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.q) {
      params.push(`%${query.q}%`);
      const idx = params.length;
      where.push(`(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR p.mrn ILIKE $${idx} OR p.phone ILIKE $${idx} OR p.national_id ILIKE $${idx})`);
    } else {
      // limit large table scans
    }
    if (query.status) add('p.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('p.tenant_id = ?', security.tenantId);
    else if (security.activeTenantId) add('p.tenant_id = ?', security.activeTenantId);

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_patient.patients p ${clause}`, params);
      const rows = await session.query(
        `SELECT p.id, p.tenant_id, p.mrn, p.first_name, p.last_name, p.middle_name, p.gender, p.date_of_birth, p.phone, p.email, p.status, p.blood_group, p.created_at, p.updated_at
         FROM health_patient.patients p ${clause} ORDER BY p.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async findById(security: HealthSecurityContext, id: string): Promise<any> {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT p.*, (SELECT json_agg(ec) FROM health_patient.emergency_contacts ec WHERE ec.patient_id=p.id) as emergency_contacts FROM health_patient.patients p WHERE p.id=$1 AND p.deleted_at IS NULL`, [id]);
      if (!r.rows[0]) notFound('patient', id);
      return r.rows[0];
    });
  }

  async create(security: HealthSecurityContext, input: CreatePatientInput): Promise<any> {
    if (!input.tenantId) badRequest('tenantId required');
    return this.mutate(security, async (session) => {
      const mrnRes = await session.query<{ mrn: string }>(`SELECT health_patient.generate_mrn($1) as mrn`, [input.tenantId]);
      const mrn = mrnRes.rows[0].mrn;
      const res = await session.query<{ id: string }>(
        `INSERT INTO health_patient.patients (tenant_id, mrn, first_name, last_name, middle_name, gender, date_of_birth, phone, email, national_id, address, blood_group, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [input.tenantId, mrn, input.firstName, input.lastName, input.middleName ?? null, input.gender, input.dateOfBirth, input.phone ?? null, input.email ?? null, input.nationalId ?? null, input.address ?? null, input.bloodGroup ?? null, input.createdBy],
      );
      const patientId = res.rows[0].id;
      if (input.emergencyContacts?.length) {
        for (const ec of input.emergencyContacts) {
          await session.query(`INSERT INTO health_patient.emergency_contacts (patient_id, name, relationship, phone, is_primary) VALUES ($1,$2,$3,$4,$5)`, [patientId, ec.name, ec.relationship, ec.phone, ec.isPrimary ?? false]);
        }
      }
      const patient = await session.query(`SELECT * FROM health_patient.patients WHERE id=$1`, [patientId]);
      return patient.rows[0];
    }, (result) => ({
      action: 'CREATE',
      resourceType: 'patient',
      resourceId: (result as any).id,
      newState: result as any,
    }));
  }

  async update(security: HealthSecurityContext, id: string, updates: Record<string, unknown>): Promise<any> {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_patient.patients WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!existing.rows[0]) notFound('patient', id);
      const fields: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(updates)) {
        if (['first_name','last_name','middle_name','phone','email','address','blood_group','status'].includes(k)) {
          fields.push(`${k} = $${idx++}`);
          params.push(v);
        }
      }
      if (fields.length === 0) return existing.rows[0];
      params.push(id);
      const res = await session.query(`UPDATE health_patient.patients SET ${fields.join(', ')}, updated_at=now() WHERE id=$${idx} RETURNING *`, params);
      return res.rows[0];
    }, (result) => ({
      action: 'UPDATE',
      resourceType: 'patient',
      resourceId: id,
      previousState: {} as any,
      newState: result as any,
    }));
  }

  async timeline(security: HealthSecurityContext, patientId: string): Promise<any[]> {
    return this.read(security, async (session) => {
      const [encounters, conditions, observations, notes, prescriptions, labs, imaging, appointments, invoices] = await Promise.all([
        session.query(`SELECT 'encounter' as type, id, period_start as date, status, class as detail FROM health_clinical.encounters WHERE patient_id=$1 ORDER BY period_start DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'condition' as type, id, recorded_date as date, display as detail, clinical_status as status FROM health_clinical.conditions WHERE patient_id=$1 ORDER BY recorded_date DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'observation' as type, id, effective_datetime as date, display as detail FROM health_clinical.observations WHERE patient_id=$1 ORDER BY effective_datetime DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'note' as type, id, created_at as date, title as detail FROM health_clinical.clinical_notes WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'prescription' as type, id, authored_on as date, status as detail FROM health_pharmacy.prescriptions WHERE patient_id=$1 ORDER BY authored_on DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'lab' as type, id, performed_at as date, status as detail FROM health_lab.lab_results WHERE patient_id=$1 ORDER BY performed_at DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'imaging' as type, id, started_at as date, modality as detail FROM health_radiology.imaging_studies WHERE patient_id=$1 ORDER BY started_at DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'appointment' as type, id, start as date, status as detail FROM health_scheduling.appointments WHERE patient_id=$1 ORDER BY start DESC LIMIT 20`, [patientId]),
        session.query(`SELECT 'invoice' as type, id, created_at as date, total_minor as detail, status FROM health_billing.invoices WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 20`, [patientId]),
      ]);
      const all = [...encounters.rows, ...conditions.rows, ...observations.rows, ...notes.rows, ...prescriptions.rows, ...labs.rows, ...imaging.rows, ...appointments.rows, ...invoices.rows]
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 50);
      return all;
    });
  }
}
