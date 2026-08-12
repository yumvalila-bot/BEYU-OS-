import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class OphthalmologyRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async listExams(security: HealthSecurityContext, query: { patientId?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('e.patient_id = ?', query.patientId);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('e.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_ophthalmology.ophthalmology_exams e ${clause}`, params);
      const rows = await session.query(`SELECT e.*, p.first_name, p.last_name, p.mrn FROM health_ophthalmology.ophthalmology_exams e JOIN health_patient.patients p ON p.id=e.patient_id ${clause} ORDER BY e.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async getExam(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const exam = await session.query(`SELECT e.*, p.first_name, p.last_name, p.mrn, p.date_of_birth FROM health_ophthalmology.ophthalmology_exams e JOIN health_patient.patients p ON p.id=e.patient_id WHERE e.id=$1`, [id]);
      if (!exam.rows[0]) notFound('ophthalmology_exam', id);
      const examId = id;
      const [va, refractions, externals, pupils, motility, slitLamp, iop, gonio, fundus, diagnoses, imaging, history] = await Promise.all([
        session.query(`SELECT * FROM health_ophthalmology.visual_acuity WHERE encounter_id=$1 ORDER BY eye`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.refraction WHERE encounter_id=$1 ORDER BY eye`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.external_exam WHERE encounter_id=$1`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.pupil_exam WHERE encounter_id=$1`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.ocular_motility WHERE encounter_id=$1 LIMIT 1`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.slit_lamp_exam WHERE encounter_id=$1 ORDER BY eye`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.intraocular_pressure WHERE encounter_id=$1 ORDER BY time_measured DESC`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.gonioscopy WHERE encounter_id=$1`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.fundus_exam WHERE encounter_id=$1 ORDER BY eye`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.ophthalmic_diagnoses WHERE encounter_id=$1`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.ophthalmic_imaging WHERE encounter_id=$1 ORDER BY performed_at DESC`, [exam.rows[0].encounter_id]),
        session.query(`SELECT * FROM health_ophthalmology.ophthalmology_history WHERE encounter_id=$1 LIMIT 1`, [exam.rows[0].encounter_id]),
      ]);
      return {
        ...exam.rows[0],
        history: history.rows[0] ?? null,
        visualAcuities: va.rows,
        refractions: refractions.rows,
        externalExams: externals.rows,
        pupilExams: pupils.rows,
        motility: motility.rows[0] ?? null,
        slitLamp: slitLamp.rows,
        iop: iop.rows,
        gonioscopy: gonio.rows,
        fundus: fundus.rows,
        diagnoses: diagnoses.rows,
        imaging: imaging.rows,
      };
    });
  }

  async createExam(security: HealthSecurityContext, input: { patientId: string; encounterId: string; chiefComplaint?: string; examinationType?: string; plan?: string; history?: any; visualAcuity?: any[]; refraction?: any[]; iop?: any[]; slitLamp?: any[]; fundus?: any[]; diagnoses?: any[]; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const examRes = await session.query<{ id: string }>(`INSERT INTO health_ophthalmology.ophthalmology_exams (tenant_id, patient_id, encounter_id, chief_complaint, examination_type, plan, examiner_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, input.patientId, input.encounterId, input.chiefComplaint ?? null, input.examinationType ?? 'COMPREHENSIVE', input.plan ?? null, security.userId]);
      const examId = examRes.rows[0].id;

      if (input.history) {
        await session.query(`INSERT INTO health_ophthalmology.ophthalmology_history (tenant_id, patient_id, encounter_id, ocular_history, systemic_history, family_history, medication_history, previous_surgeries, trauma_history, chief_complaint, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [tenantId, input.patientId, input.encounterId, input.history.ocularHistory ?? null, input.history.systemicHistory ?? null, input.history.familyHistory ?? null, input.history.medicationHistory ?? null, input.history.previousSurgeries ?? null, input.history.traumaHistory ?? null, input.chiefComplaint ?? null, security.userId]);
      }
      if (input.visualAcuity?.length) {
        for (const va of input.visualAcuity) {
          await session.query(`INSERT INTO health_ophthalmology.visual_acuity (tenant_id, patient_id, encounter_id, eye, unaided_distance, aided_distance, pinhole, near_vision, bcva, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [tenantId, input.patientId, input.encounterId, va.eye, va.unaidedDistance ?? null, va.aidedDistance ?? null, va.pinhole ?? null, va.nearVision ?? null, va.bcva ?? null, security.userId]);
        }
      }
      if (input.refraction?.length) {
        for (const r of input.refraction) {
          await session.query(`INSERT INTO health_ophthalmology.refraction (tenant_id, patient_id, encounter_id, eye, sphere, cylinder, axis, add_power, bcva, type, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [tenantId, input.patientId, input.encounterId, r.eye, r.sphere ?? null, r.cylinder ?? null, r.axis ?? null, r.add ?? null, r.bcva ?? null, r.type ?? 'MANUAL', security.userId]);
        }
      }
      if (input.iop?.length) {
        for (const iop of input.iop) {
          await session.query(`INSERT INTO health_ophthalmology.intraocular_pressure (tenant_id, patient_id, encounter_id, eye, method, value_mmhg, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [tenantId, input.patientId, input.encounterId, iop.eye, iop.method ?? 'GOLDMANN', iop.valueMmhg, security.userId]);
        }
      }
      if (input.slitLamp?.length) {
        for (const sl of input.slitLamp) {
          await session.query(`INSERT INTO health_ophthalmology.slit_lamp_exam (tenant_id, patient_id, encounter_id, eye, cornea, lens, notes, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [tenantId, input.patientId, input.encounterId, sl.eye, sl.cornea ?? null, sl.lens ?? null, sl.notes ?? null, security.userId]);
        }
      }
      if (input.fundus?.length) {
        for (const f of input.fundus) {
          await session.query(`INSERT INTO health_ophthalmology.fundus_exam (tenant_id, patient_id, encounter_id, eye, optic_disc, cup_disc_ratio, macula, retina, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [tenantId, input.patientId, input.encounterId, f.eye, f.opticDisc ?? null, f.cupDiscRatio ?? null, f.macula ?? null, f.retina ?? null, security.userId]);
        }
      }
      if (input.diagnoses?.length) {
        for (const d of input.diagnoses) {
          await session.query(`INSERT INTO health_ophthalmology.ophthalmic_diagnoses (tenant_id, patient_id, encounter_id, eye, code, display, category, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [tenantId, input.patientId, input.encounterId, d.eye, d.code, d.display, d.category, security.userId]);
        }
      }
      const full = await session.query(`SELECT * FROM health_ophthalmology.ophthalmology_exams WHERE id=$1`, [examId]);
      return full.rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'ophthalmology_exam', resourceId: (result as any).id, newState: result as any }));
  }

  async createImaging(security: HealthSecurityContext, input: { patientId: string; encounterId: string; eye: string; modality: string; findings?: string; imageUrl?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ophthalmology.ophthalmic_imaging (tenant_id, patient_id, encounter_id, eye, modality, findings, image_url, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, input.patientId, input.encounterId, input.eye, input.modality, input.findings ?? null, input.imageUrl ?? null, security.userId]);
      return (await session.query(`SELECT * FROM health_ophthalmology.ophthalmic_imaging WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'ophthalmic_imaging', resourceId: (result as any).id, newState: result as any }));
  }

  async createPrescription(security: HealthSecurityContext, input: { patientId: string; encounterId: string; type: string; odSphere?: number; odCylinder?: number; odAxis?: number; odAdd?: number; osSphere?: number; osCylinder?: number; osAxis?: number; osAdd?: number; notes?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const prescriptionNumber = `OPT-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ophthalmology.optical_prescriptions (tenant_id, patient_id, encounter_id, prescriber_id, prescription_number, type, od_sphere, od_cylinder, od_axis, od_add, os_sphere, os_cylinder, os_axis, os_add, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [tenantId, input.patientId, input.encounterId, security.userId, prescriptionNumber, input.type, input.odSphere ?? null, input.odCylinder ?? null, input.odAxis ?? null, input.odAdd ?? null, input.osSphere ?? null, input.osCylinder ?? null, input.osAxis ?? null, input.osAdd ?? null, input.notes ?? null]);
      return (await session.query(`SELECT * FROM health_ophthalmology.optical_prescriptions WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'optical_prescription', resourceId: (result as any).id, newState: result as any }));
  }

  async diseasePatterns(security: HealthSecurityContext, facilityId?: string) {
    return this.read(security, async (session) => {
      const where = security.tenantId && !security.roles.includes('SUPER_ADMIN') ? `WHERE od.tenant_id=$1` : '';
      const params = security.tenantId && !security.roles.includes('SUPER_ADMIN') ? [security.tenantId] : [];
      const rows = await session.query(
        `SELECT od.category, od.eye, COUNT(*)::int as count, COUNT(*) FILTER (WHERE od.severity='SEVERE')::int as severe_count FROM health_ophthalmology.ophthalmic_diagnoses od ${where} GROUP BY od.category, od.eye ORDER BY count DESC`,
        params,
      );
      return rows.rows;
    });
  }
}
