import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/** Equipment, maintenance, fuel logs, workers and work orders. */
@Injectable()
export class OperationsRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Equipment ─────────────────────────────────────────────────────────

  async listEquipment(security: AgriSecurityContext, query: { q?: string; farmId?: string; status?: string; equipmentType?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['e.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`e.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`e.farm_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`e.status = $${params.length}`); }
    if (query.equipmentType) { params.push(query.equipmentType); where.push(`e.equipment_type = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(e.name ILIKE $${params.length} OR e.code ILIKE $${params.length})`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_equipment.equipment e ${clause}`, params);
      const rows = await session.query(`SELECT e.* FROM agri_equipment.equipment e ${clause} ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createEquipment(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; code: string; name: string; equipmentType: string; purchaseDate?: string | null; purchaseCost?: number | null; currency?: string | null; notes?: string | null }): Promise<any> {
    if (!input.code || !input.name || !input.equipmentType) badRequest('code, name and equipmentType are required');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.farmId) {
        const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        tenantId = farm.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('tenantId or tenant membership required');
      const dupe = await session.query(`SELECT id FROM agri_equipment.equipment WHERE tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, [tenantId, input.code]);
      if (dupe.rows[0]) conflict('equipment code already exists in tenant');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_equipment.equipment (tenant_id, farm_id, code, name, equipment_type, status, purchase_date, purchase_cost, currency, notes)
         VALUES ($1,$2,$3,$4,$5,'OPERATIONAL',$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.farmId ?? null, input.code, input.name, input.equipmentType, input.purchaseDate ?? null, input.purchaseCost ?? null, input.currency ?? null, input.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_equipment.equipment WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'equipment', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async updateEquipment(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const camelToSnake: Record<string, string> = { equipmentType: 'equipment_type', purchaseDate: 'purchase_date', purchaseCost: 'purchase_cost', farmId: 'farm_id', operatingHours: 'operating_hours' };
    const allowed = Object.keys(camelToSnake).concat(['name', 'status', 'notes', 'currency']);
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    if (keys.includes('operatingHours') && Number(patch['operatingHours']) < 0) badRequest('operatingHours cannot be negative');
    const assignments = keys.map((k, i) => `${camelToSnake[k] ?? k}=$${i + 2}`);
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_equipment.equipment WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('equipment', id);
      this.assertRowVisible(security, prev.rows[0], 'equipment', id);
      await session.query(`UPDATE agri_equipment.equipment SET ${assignments.join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_equipment.equipment WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'equipment', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  async addMaintenanceLog(security: AgriSecurityContext, input: { equipmentId: string; maintenanceType: string; performedOn: string; performedBy?: string | null; costAmount?: number | null; costCurrency?: string | null; hoursAtService?: number | null; notes?: string | null }): Promise<any> {
    if (!input.equipmentId || !input.maintenanceType || !input.performedOn) badRequest('equipmentId, maintenanceType and performedOn are required');
    return this.mutate(security, async (session) => {
      const eq = await session.query<any>(`SELECT * FROM agri_equipment.equipment WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [input.equipmentId]);
      if (!eq.rows[0]) notFound('equipment', input.equipmentId);
      this.assertRowVisible(security, eq.rows[0], 'equipment', input.equipmentId);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_equipment.maintenance_logs (tenant_id, equipment_id, maintenance_type, performed_on, performed_by, cost_amount, cost_currency, hours_at_service, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [eq.rows[0].tenant_id, input.equipmentId, input.maintenanceType, input.performedOn, input.performedBy ?? null, input.costAmount ?? null, input.costCurrency ?? null, input.hoursAtService ?? null, input.notes ?? null],
      );
      if (input.hoursAtService != null && Number(input.hoursAtService) > Number(eq.rows[0].operating_hours)) {
        await session.query(`UPDATE agri_equipment.equipment SET operating_hours=$2, updated_at=now() WHERE id=$1`, [input.equipmentId, input.hoursAtService]);
      }
      if (input.maintenanceType === 'REPAIR') {
        await session.query(`UPDATE agri_equipment.equipment SET status='OPERATIONAL', updated_at=now() WHERE id=$1 AND status='BROKEN_DOWN'`, [input.equipmentId]);
      }
      const row = await session.query(`SELECT * FROM agri_equipment.maintenance_logs WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'maintenance_log', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async addFuelLog(security: AgriSecurityContext, input: { equipmentId: string; fueledOn: string; fuelLitres: number; hoursAtFueling?: number | null; costAmount?: number | null; costCurrency?: string | null; notes?: string | null }): Promise<any> {
    if (!input.equipmentId || !input.fueledOn) badRequest('equipmentId and fueledOn are required');
    if (input.fuelLitres == null || input.fuelLitres <= 0) badRequest('fuelLitres must be positive');
    return this.mutate(security, async (session) => {
      const eq = await session.query<any>(`SELECT * FROM agri_equipment.equipment WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [input.equipmentId]);
      if (!eq.rows[0]) notFound('equipment', input.equipmentId);
      this.assertRowVisible(security, eq.rows[0], 'equipment', input.equipmentId);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_equipment.fuel_logs (tenant_id, equipment_id, fueled_on, fuel_litres, hours_at_fueling, cost_amount, cost_currency, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [eq.rows[0].tenant_id, input.equipmentId, input.fueledOn, input.fuelLitres, input.hoursAtFueling ?? null, input.costAmount ?? null, input.costCurrency ?? null, input.notes ?? null],
      );
      if (input.hoursAtFueling != null && Number(input.hoursAtFueling) > Number(eq.rows[0].operating_hours)) {
        await session.query(`UPDATE agri_equipment.equipment SET operating_hours=$2, updated_at=now() WHERE id=$1`, [input.equipmentId, input.hoursAtFueling]);
      }
      const row = await session.query(`SELECT * FROM agri_equipment.fuel_logs WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'fuel_log', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async listFuelLogs(security: AgriSecurityContext, equipmentId?: string, limit?: number, offset?: number): Promise<Page<any>> {
    const lim = resolveLimit(limit);
    const off = resolveOffset(offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`fl.tenant_id = $${params.length}`); }
    if (equipmentId) { params.push(equipmentId); where.push(`fl.equipment_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_equipment.fuel_logs fl ${clause}`, params);
      const rows = await session.query(`SELECT fl.*, e.code AS equipment_code FROM agri_equipment.fuel_logs fl JOIN agri_equipment.equipment e ON e.id=fl.equipment_id ${clause} ORDER BY fl.fueled_on DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lim, off]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit: lim, offset: off };
    });
  }

  async listMaintenanceLogs(security: AgriSecurityContext, equipmentId?: string, limit?: number, offset?: number): Promise<Page<any>> {
    const lim = resolveLimit(limit);
    const off = resolveOffset(offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`ml.tenant_id = $${params.length}`); }
    if (equipmentId) { params.push(equipmentId); where.push(`ml.equipment_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_equipment.maintenance_logs ml ${clause}`, params);
      const rows = await session.query(`SELECT ml.*, e.code AS equipment_code FROM agri_equipment.maintenance_logs ml JOIN agri_equipment.equipment e ON e.id=ml.equipment_id ${clause} ORDER BY ml.performed_on DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lim, off]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit: lim, offset: off };
    });
  }

  // ── Workers ───────────────────────────────────────────────────────────

  async listWorkers(security: AgriSecurityContext, query: { q?: string; farmId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['w.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`w.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`w.farm_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(w.full_name ILIKE $${params.length} OR w.worker_code ILIKE $${params.length})`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_workforce.workers w ${clause}`, params);
      const rows = await session.query(`SELECT w.* FROM agri_workforce.workers w ${clause} ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createWorker(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; fullName: string; phone?: string | null; role?: string | null }): Promise<any> {
    if (!input.fullName) badRequest('fullName is required');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.farmId) {
        const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        tenantId = farm.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('tenantId or tenant membership required');
      const codeRes = await session.query<{ code: string }>(`SELECT agri_workforce.generate_worker_code($1) AS code`, [tenantId]);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_workforce.workers (tenant_id, farm_id, worker_code, full_name, phone, role, status)
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
        [tenantId, input.farmId ?? null, codeRes.rows[0].code, input.fullName, input.phone ?? null, input.role ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_workforce.workers WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'worker', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Work orders ───────────────────────────────────────────────────────

  async listWorkOrders(security: AgriSecurityContext, query: { status?: string; farmId?: string; fieldId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['wo.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`wo.tenant_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`wo.status = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`wo.farm_id = $${params.length}`); }
    if (query.fieldId) { params.push(query.fieldId); where.push(`wo.field_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_workforce.work_orders wo ${clause}`, params);
      const rows = await session.query(
        `SELECT wo.*, w.full_name AS assigned_to_name, f.code AS field_code FROM agri_workforce.work_orders wo
         LEFT JOIN agri_workforce.workers w ON w.id=wo.assigned_to_worker_id
         LEFT JOIN agri_farm.fields f ON f.id=wo.field_id ${clause}
         ORDER BY wo.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createWorkOrder(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; fieldId?: string | null; title: string; description?: string | null; priority?: string; assignedToWorkerId?: string | null; scheduledFor?: string | null }): Promise<any> {
    if (!input.title) badRequest('title is required');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.fieldId) {
        const field = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [input.fieldId]);
        if (!field.rows[0]) notFound('field', input.fieldId);
        tenantId = field.rows[0].tenant_id;
      } else if (input.farmId) {
        const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        tenantId = farm.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('tenantId or tenant membership required');
      if (input.assignedToWorkerId) {
        const worker = await session.query(`SELECT id, tenant_id FROM agri_workforce.workers WHERE id=$1 AND deleted_at IS NULL`, [input.assignedToWorkerId]);
        if (!worker.rows[0]) notFound('worker', input.assignedToWorkerId);
        if (worker.rows[0].tenant_id !== tenantId) badRequest('worker belongs to a different tenant');
      }
      const numberRes = await session.query<{ number: string }>(`SELECT agri_workforce.generate_wo_number($1) AS number`, [tenantId]);
      const status = input.assignedToWorkerId ? 'ASSIGNED' : 'DRAFT';
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_workforce.work_orders (tenant_id, farm_id, field_id, work_order_number, title, description, priority, status, assigned_to_worker_id, scheduled_for, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, input.farmId ?? null, input.fieldId ?? null, numberRes.rows[0].number, input.title, input.description ?? null, input.priority ?? 'NORMAL', status, input.assignedToWorkerId ?? null, input.scheduledFor ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_workforce.work_orders WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'work_order', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async transitionWorkOrder(security: AgriSecurityContext, id: string, target: string): Promise<any> {
    const allowed: Record<string, string[]> = {
      ASSIGNED: ['DRAFT'],
      IN_PROGRESS: ['ASSIGNED', 'DRAFT'],
      COMPLETED: ['IN_PROGRESS', 'ASSIGNED'],
      CANCELLED: ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'],
    };
    return this.mutate(security, async (session) => {
      const wo = await session.query<any>(`SELECT * FROM agri_workforce.work_orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!wo.rows[0]) notFound('work_order', id);
      this.assertRowVisible(security, wo.rows[0], 'work_order', id);
      if (!allowed[target]) badRequest(`unknown status ${target}`);
      if (!allowed[target].includes(wo.rows[0].status)) conflict(`cannot transition work order from ${wo.rows[0].status} to ${target}`);
      const completedOn = target === 'COMPLETED' ? new Date().toISOString() : null;
      await session.query(`UPDATE agri_workforce.work_orders SET status=$2, completed_on=COALESCE($3, completed_on), updated_at=now() WHERE id=$1`, [id, target, completedOn]);
      const row = await session.query(`SELECT * FROM agri_workforce.work_orders WHERE id=$1`, [id]);
      return { before: wo.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'work_order', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }
}
