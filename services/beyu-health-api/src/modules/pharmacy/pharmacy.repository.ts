import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound, badRequest } from '../../common/errors';

@Injectable()
export class PharmacyRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async drugs(security: HealthSecurityContext, query: { q?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = ["d.status='ACTIVE'"]; const params: unknown[] = [];
    if (query.q) { params.push(`%${query.q}%`); where.push(`(d.name ILIKE $${params.length} OR d.generic_name ILIKE $${params.length} OR d.code ILIKE $${params.length})`); }
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where.push(`d.tenant_id=$${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_pharmacy.drugs d ${clause}`, params);
      const rows = await session.query(`SELECT d.* FROM health_pharmacy.drugs d ${clause} ORDER BY d.name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async prescriptions(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('p.patient_id = ?', query.patientId);
    if (query.status) add('p.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('p.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_pharmacy.prescriptions p ${clause}`, params);
      const rows = await session.query(`SELECT p.*, d.name as drug_name, pt.first_name, pt.last_name FROM health_pharmacy.prescriptions p JOIN health_pharmacy.drugs d ON d.id=p.drug_id JOIN health_patient.patients pt ON pt.id=p.patient_id ${clause} ORDER BY p.authored_on DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async safetyCheck(security: HealthSecurityContext, patientId: string, drugId: string) {
    return this.read(security, async (session) => {
      const allergies = await session.query(`SELECT * FROM health_patient.allergies WHERE patient_id=$1 AND status='ACTIVE'`, [patientId]);
      const currentMeds = await session.query(`SELECT p.drug_id, d.name FROM health_pharmacy.prescriptions p JOIN health_pharmacy.drugs d ON d.id=p.drug_id WHERE p.patient_id=$1 AND p.status='ACTIVE'`, [patientId]);
      const interactions = await session.query(`SELECT di.* FROM health_pharmacy.drug_interactions di WHERE (di.drug_a_id=$1 AND di.drug_b_id = ANY($2)) OR (di.drug_b_id=$1 AND di.drug_a_id = ANY($2))`, [drugId, currentMeds.rows.map(r=>r.drug_id)]);
      const allergyFound = allergies.rows.length > 0;
      const interactionFound = interactions.rows.length > 0;
      return {
        allergyFound,
        duplicateFound: currentMeds.rows.some(r=>r.drug_id===drugId),
        interactionFound,
        contraindicationFound: false,
        details: [
          ...allergies.rows.map((a: any)=>({ type: 'ALLERGY', severity: a.criticality, message: `Patient allergic to ${a.display}` })),
          ...interactions.rows.map((i: any)=>({ type: 'INTERACTION', severity: i.severity, message: i.description })),
        ],
      };
    });
  }

  async createPrescription(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; drugId: string; dosageInstruction: string; quantity: number; unit: string; durationDays?: number; priority?: string; note?: string; }) {
    const safety = await this.safetyCheck(security, input.patientId, input.drugId);
    if (safety.details.some((d:any)=>d.severity==='CONTRAINDICATED')) badRequest('Contraindicated medication');
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_pharmacy.prescriptions (tenant_id, patient_id, encounter_id, prescriber_id, drug_id, dosage_instruction, quantity, unit, duration_days, priority, note, safety_check) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, security.userId, input.drugId, input.dosageInstruction, input.quantity, input.unit, input.durationDays ?? null, input.priority ?? 'ROUTINE', input.note ?? null, JSON.stringify(safety)]);
      return (await session.query(`SELECT p.*, d.name as drug_name FROM health_pharmacy.prescriptions p JOIN health_pharmacy.drugs d ON d.id=p.drug_id WHERE p.id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'prescription', resourceId: (result as any).id, newState: result as any }));
  }

  async dispense(security: HealthSecurityContext, prescriptionId: string, input: { quantity: number; unit: string; batchNumber?: string; }) {
    return this.mutate(security, async (session) => {
      const prescription = await session.query(`SELECT * FROM health_pharmacy.prescriptions WHERE id=$1`, [prescriptionId]);
      if (!prescription.rows[0]) notFound('prescription', prescriptionId);
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_pharmacy.dispenses (tenant_id, prescription_id, patient_id, drug_id, dispenser_id, quantity, unit, batch_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, prescription.rows[0].patient_id, prescription.rows[0].drug_id, security.userId, input.quantity, input.unit, input.batchNumber ?? null]);
      await session.query(`UPDATE health_pharmacy.prescriptions SET status='COMPLETED' WHERE id=$1`, [prescriptionId]);
      return (await session.query(`SELECT * FROM health_pharmacy.dispenses WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'dispense', resourceId: (result as any).id, newState: result as any }));
  }
}
