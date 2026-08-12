import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class LaboratoryRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async catalog(security: HealthSecurityContext, q?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = []; let where = "c.status='ACTIVE'";
      if (q) { params.push(`%${q}%`); where += ` AND (c.name ILIKE $${params.length} OR c.code ILIKE $${params.length})`; }
      if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where += ` AND c.tenant_id=$${params.length}`; }
      const rows = await session.query(`SELECT c.* FROM health_lab.test_catalog c WHERE ${where} ORDER BY c.name LIMIT 100`, params);
      return rows.rows;
    });
  }

  async orders(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('o.patient_id = ?', query.patientId);
    if (query.status) add('o.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('o.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_lab.lab_orders o ${clause}`, params);
      const rows = await session.query(`SELECT o.*, p.first_name, p.last_name FROM health_lab.lab_orders o JOIN health_patient.patients p ON p.id=o.patient_id ${clause} ORDER BY o.ordered_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createOrder(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; tests: string[]; priority?: string; clinicalInfo?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const orderNumber = `LAB-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_lab.lab_orders (tenant_id, patient_id, encounter_id, orderer_id, order_number, priority, clinical_info) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, security.userId, orderNumber, input.priority ?? 'ROUTINE', input.clinicalInfo ?? null]);
      const orderId = res.rows[0].id;
      for (const testId of input.tests) {
        await session.query(`INSERT INTO health_lab.lab_order_tests (order_id, test_id) VALUES ($1,$2)`, [orderId, testId]);
      }
      return (await session.query(`SELECT * FROM health_lab.lab_orders WHERE id=$1`, [orderId])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'lab_order', resourceId: (result as any).id, newState: result as any }));
  }

  async addResult(security: HealthSecurityContext, orderId: string, input: { testId: string; valueQuantity?: number; valueUnit?: string; valueString?: string; interpretation?: string; isCritical?: boolean; }) {
    return this.mutate(security, async (session) => {
      const order = await session.query(`SELECT * FROM health_lab.lab_orders WHERE id=$1`, [orderId]);
      if (!order.rows[0]) notFound('lab_order', orderId);
      const res = await session.query<{ id: string }>(`INSERT INTO health_lab.lab_results (tenant_id, order_id, test_id, patient_id, value_quantity, value_unit, value_string, interpretation, is_critical, performed_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'FINAL') RETURNING id`,
        [order.rows[0].tenant_id, orderId, input.testId, order.rows[0].patient_id, input.valueQuantity ?? null, input.valueUnit ?? null, input.valueString ?? null, input.interpretation ?? null, input.isCritical ?? false, security.userId]);
      await session.query(`UPDATE health_lab.lab_order_tests SET status='COMPLETED' WHERE order_id=$1 AND test_id=$2`, [orderId, input.testId]);
      return (await session.query(`SELECT * FROM health_lab.lab_results WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'lab_result', resourceId: (result as any).id, newState: result as any }));
  }

  async results(security: HealthSecurityContext, patientId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT r.*, c.name as test_name FROM health_lab.lab_results r JOIN health_lab.test_catalog c ON c.id=r.test_id WHERE r.patient_id=$1 ORDER BY r.performed_at DESC LIMIT 100`, [patientId]);
      return rows.rows;
    });
  }
}
