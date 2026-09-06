import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/** Crops, crop cycles, field activities, harvests, storage lots. */
@Injectable()
export class CropRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Crop catalogue ────────────────────────────────────────────────────

  async listCrops(security: AgriSecurityContext, query: { q?: string; category?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['c.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`c.tenant_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(c.name ILIKE $${params.length} OR c.code ILIKE $${params.length})`); }
    if (query.category) { params.push(query.category); where.push(`c.category = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_crop.crops c ${clause}`, params);
      const rows = await session.query(`SELECT c.* FROM agri_crop.crops c ${clause} ORDER BY c.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createCrop(security: AgriSecurityContext, input: { tenantId?: string; code: string; name: string; scientificName?: string | null; category: string; growingDaysMin?: number | null; growingDaysMax?: number | null }): Promise<any> {
    const tenantId = input.tenantId ?? this.tenantOf(security) ?? undefined;
    if (!tenantId) badRequest('tenantId required');
    if (!input.code || !input.name || !input.category) badRequest('code, name and category are required');
    if (input.growingDaysMin != null && input.growingDaysMin <= 0) badRequest('growingDaysMin must be positive');
    if (input.growingDaysMin != null && input.growingDaysMax != null && input.growingDaysMax < input.growingDaysMin) badRequest('growingDaysMax must be >= growingDaysMin');
    return this.mutate(security, async (session) => {
      const dupe = await session.query(`SELECT id FROM agri_crop.crops WHERE tenant_id=$1 AND (code=$2 OR lower(name)=lower($3)) AND deleted_at IS NULL`, [tenantId, input.code, input.name]);
      if (dupe.rows[0]) conflict(`crop code or name already exists in tenant`);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_crop.crops (tenant_id, code, name, scientific_name, category, growing_days_min, growing_days_max, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`,
        [tenantId, input.code, input.name, input.scientificName ?? null, input.category, input.growingDaysMin ?? null, input.growingDaysMax ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_crop.crops WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'crop', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Crop cycles ───────────────────────────────────────────────────────

  async listCropCycles(security: AgriSecurityContext, query: { fieldId?: string; cropId?: string; status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['cc.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`cc.tenant_id = $${params.length}`); }
    if (query.fieldId) { params.push(query.fieldId); where.push(`cc.field_id = $${params.length}`); }
    if (query.cropId) { params.push(query.cropId); where.push(`cc.crop_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`cc.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_crop.crop_cycles cc ${clause}`, params);
      const rows = await session.query(
        `SELECT cc.*, c.name AS crop_name, c.code AS crop_code, f.code AS field_code, f.name AS field_name
         FROM agri_crop.crop_cycles cc
         JOIN agri_crop.crops c ON c.id=cc.crop_id
         JOIN agri_farm.fields f ON f.id=cc.field_id
         ${clause} ORDER BY cc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async findCropCycleById(security: AgriSecurityContext, id: string): Promise<any> {
    return this.read(security, async (session) => {
      const r = await session.query(
        `SELECT cc.*, c.name AS crop_name, f.code AS field_code FROM agri_crop.crop_cycles cc JOIN agri_crop.crops c ON c.id=cc.crop_id JOIN agri_farm.fields f ON f.id=cc.field_id WHERE cc.id=$1 AND cc.deleted_at IS NULL`,
        [id],
      );
      if (!r.rows[0]) notFound('crop_cycle', id);
      this.assertRowVisible(security, r.rows[0], 'crop_cycle', id);
      return r.rows[0];
    });
  }

  async createCropCycle(security: AgriSecurityContext, input: { tenantId?: string; fieldId: string; cropId: string; seasonCode: string; plantedOn?: string | null; expectedHarvestOn?: string | null; areaPlantedHa?: number | null; seedRateKgPerHa?: number | null; targetYieldTonsPerHa?: number | null }): Promise<any> {
    if (!input.fieldId || !input.cropId || !input.seasonCode) badRequest('fieldId, cropId and seasonCode are required');
    if (input.areaPlantedHa != null && input.areaPlantedHa <= 0) badRequest('areaPlantedHa must be positive');
    return this.mutate(security, async (session) => {
      const field = await session.query<any>(`SELECT id, tenant_id, area_ha, status FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [input.fieldId]);
      if (!field.rows[0]) notFound('field', input.fieldId);
      const crop = await session.query<any>(`SELECT id, tenant_id FROM agri_crop.crops WHERE id=$1 AND deleted_at IS NULL`, [input.cropId]);
      if (!crop.rows[0]) notFound('crop', input.cropId);
      if (crop.rows[0].tenant_id !== field.rows[0].tenant_id) badRequest('crop belongs to a different tenant');
      if (input.areaPlantedHa != null && field.rows[0].area_ha != null && input.areaPlantedHa > field.rows[0].area_ha) {
        badRequest(`areaPlantedHa (${input.areaPlantedHa}) exceeds field area (${field.rows[0].area_ha} ha)`);
      }
      const overlap = await session.query(
        `SELECT id FROM agri_crop.crop_cycles WHERE field_id=$1 AND season_code=$2 AND status IN ('PLANNED','PLANTED','GROWING') AND deleted_at IS NULL`,
        [input.fieldId, input.seasonCode],
      );
      if (overlap.rows[0]) conflict(`field already has an active cycle for season ${input.seasonCode}`);
      const tenantId = field.rows[0].tenant_id;
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_crop.crop_cycles (tenant_id, field_id, crop_id, season_code, status, planted_on, expected_harvest_on, area_planted_ha, seed_rate_kg_per_ha, target_yield_tons_per_ha, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, input.fieldId, input.cropId, input.seasonCode, input.plantedOn ? 'PLANTED' : 'PLANNED', input.plantedOn ?? null, input.expectedHarvestOn ?? null, input.areaPlantedHa ?? null, input.seedRateKgPerHa ?? null, input.targetYieldTonsPerHa ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_crop.crop_cycles WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'crop_cycle', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async updateCropCycle(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const camelToSnake: Record<string, string> = {
      plantedOn: 'planted_on', expectedHarvestOn: 'expected_harvest_on', harvestedOn: 'harvested_on',
      areaPlantedHa: 'area_planted_ha', seedRateKgPerHa: 'seed_rate_kg_per_ha', targetYieldTonsPerHa: 'target_yield_tons_per_ha',
      actualYieldTonsPerHa: 'actual_yield_tons_per_ha',
    };
    const allowed = Object.keys(camelToSnake).concat(['status', 'notes']);
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    const assignments = keys.map((k, i) => `${camelToSnake[k] ?? k}=$${i + 2}`);
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_crop.crop_cycles WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('crop_cycle', id);
      this.assertRowVisible(security, prev.rows[0], 'crop_cycle', id);
      const nextStatus = patch['status'] ?? prev.rows[0].status;
      if (nextStatus === 'HARVESTED' && !prev.rows[0].harvested_on && !(patch as any).harvestedOn) {
        badRequest('harvestedOn is required to mark a cycle HARVESTED');
      }
      await session.query(`UPDATE agri_crop.crop_cycles SET ${assignments.join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_crop.crop_cycles WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'crop_cycle', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  // ── Field activities ──────────────────────────────────────────────────

  async listActivities(security: AgriSecurityContext, query: { fieldId?: string; cropCycleId?: string; activityType?: string; status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['a.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`a.tenant_id = $${params.length}`); }
    if (query.fieldId) { params.push(query.fieldId); where.push(`a.field_id = $${params.length}`); }
    if (query.cropCycleId) { params.push(query.cropCycleId); where.push(`a.crop_cycle_id = $${params.length}`); }
    if (query.activityType) { params.push(query.activityType); where.push(`a.activity_type = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`a.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_crop.field_activities a ${clause}`, params);
      const rows = await session.query(`SELECT a.* FROM agri_crop.field_activities a ${clause} ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createActivity(security: AgriSecurityContext, input: { tenantId?: string; fieldId: string; cropCycleId?: string | null; activityType: string; scheduledOn?: string | null; performedOn?: string | null; costAmount?: number | null; costCurrency?: string | null; notes?: string | null }): Promise<any> {
    if (!input.fieldId || !input.activityType) badRequest('fieldId and activityType are required');
    if (input.costAmount != null && input.costAmount < 0) badRequest('costAmount cannot be negative');
    return this.mutate(security, async (session) => {
      const field = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [input.fieldId]);
      if (!field.rows[0]) notFound('field', input.fieldId);
      if (input.cropCycleId) {
        const cycle = await session.query<any>(`SELECT id, field_id FROM agri_crop.crop_cycles WHERE id=$1 AND deleted_at IS NULL`, [input.cropCycleId]);
        if (!cycle.rows[0]) notFound('crop_cycle', input.cropCycleId);
        if (cycle.rows[0].field_id !== input.fieldId) badRequest('cropCycle does not belong to this field');
      }
      const status = input.performedOn ? 'COMPLETED' : 'SCHEDULED';
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_crop.field_activities (tenant_id, crop_cycle_id, field_id, activity_type, status, scheduled_on, performed_on, performed_by_user_id, cost_amount, cost_currency, finance_status, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING_INTEGRATION',$11,$12) RETURNING id`,
        [field.rows[0].tenant_id, input.cropCycleId ?? null, input.fieldId, input.activityType, status, input.scheduledOn ?? null, input.performedOn ?? null, status === 'COMPLETED' ? security.userId : null, input.costAmount ?? null, input.costCurrency ?? null, input.notes ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_crop.field_activities WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'field_activity', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async completeActivity(security: AgriSecurityContext, id: string, patch: { performedOn?: string; notes?: string | null; costAmount?: number | null; costCurrency?: string | null }): Promise<any> {
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_crop.field_activities WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!prev.rows[0]) notFound('field_activity', id);
      if (prev.rows[0].status === 'CANCELLED') badRequest('activity is cancelled');
      const performedOn = patch.performedOn ?? new Date().toISOString().slice(0, 10);
      await session.query(
        `UPDATE agri_crop.field_activities SET status='COMPLETED', performed_on=$2, performed_by_user_id=$3, cost_amount=COALESCE($4, cost_amount), cost_currency=COALESCE($5, cost_currency), notes=COALESCE($6, notes), updated_at=now() WHERE id=$1`,
        [id, performedOn, security.userId, patch.costAmount ?? null, patch.costCurrency ?? null, patch.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_crop.field_activities WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'field_activity', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  // ── Harvests ──────────────────────────────────────────────────────────

  async listHarvests(security: AgriSecurityContext, query: { cropCycleId?: string; fieldId?: string; status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['h.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`h.tenant_id = $${params.length}`); }
    if (query.cropCycleId) { params.push(query.cropCycleId); where.push(`h.crop_cycle_id = $${params.length}`); }
    if (query.fieldId) { params.push(query.fieldId); where.push(`h.field_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`h.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_crop.harvests h ${clause}`, params);
      const rows = await session.query(
        `SELECT h.*, c.name AS crop_name, f.code AS field_code FROM agri_crop.harvests h
         JOIN agri_crop.crop_cycles cc ON cc.id=h.crop_cycle_id
         JOIN agri_crop.crops c ON c.id=cc.crop_id
         JOIN agri_farm.fields f ON f.id=h.field_id
         ${clause} ORDER BY h.harvested_on DESC, h.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createHarvest(security: AgriSecurityContext, input: { tenantId?: string; cropCycleId: string; harvestedOn: string; quantityKg: number; moisturePct?: number | null; qualityGrade?: string | null; notes?: string | null }): Promise<any> {
    if (!input.cropCycleId || !input.harvestedOn) badRequest('cropCycleId and harvestedOn are required');
    if (input.quantityKg == null || input.quantityKg <= 0) badRequest('quantityKg must be positive');
    return this.mutate(security, async (session) => {
      const cycle = await session.query<any>(`SELECT * FROM agri_crop.crop_cycles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [input.cropCycleId]);
      if (!cycle.rows[0]) notFound('crop_cycle', input.cropCycleId);
      this.assertRowVisible(security, cycle.rows[0], 'crop_cycle', input.cropCycleId);
      if (['HARVESTED', 'TERMINATED'].includes(cycle.rows[0].status)) conflict('crop cycle is already harvested or terminated');
      const tenantId = cycle.rows[0].tenant_id;
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_crop.harvests (tenant_id, crop_cycle_id, field_id, status, harvested_on, quantity_kg, moisture_pct, quality_grade, notes, created_by)
         VALUES ($1,$2,$3,'COMPLETED',$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.cropCycleId, cycle.rows[0].field_id, input.harvestedOn, input.quantityKg, input.moisturePct ?? null, input.qualityGrade ?? null, input.notes ?? null, security.userId],
      );
      // Recompute accumulated yield atomically. The cycle is NOT auto-closed:
      // split harvests are normal; closing is an explicit cycle transition.
      const total = await session.query<{ total: string }>(`SELECT COALESCE(SUM(quantity_kg),0)::text AS total FROM agri_crop.harvests WHERE crop_cycle_id=$1 AND deleted_at IS NULL`, [input.cropCycleId]);
      const area = cycle.rows[0].area_planted_ha;
      const totalKg = Number(total.rows[0].total);
      const actual = area ? Number((totalKg / 1000 / area).toFixed(4)) : null;
      await session.query(
        `UPDATE agri_crop.crop_cycles SET actual_yield_tons_per_ha=$2, updated_at=now() WHERE id=$1`,
        [input.cropCycleId, actual],
      );
      const row = await session.query(`SELECT * FROM agri_crop.harvests WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'harvest', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Storage lots ──────────────────────────────────────────────────────

  async listStorageLots(security: AgriSecurityContext, query: { warehouseId?: string; status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`sl.tenant_id = $${params.length}`); }
    if (query.warehouseId) { params.push(query.warehouseId); where.push(`sl.warehouse_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`sl.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_crop.storage_lots sl ${clause}`, params);
      const rows = await session.query(`SELECT sl.* FROM agri_crop.storage_lots sl ${clause} ORDER BY sl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createStorageLot(security: AgriSecurityContext, input: { tenantId?: string; harvestId?: string | null; warehouseId: string; cropId?: string | null; quantityKg: number }): Promise<any> {
    if (!input.warehouseId) badRequest('warehouseId is required');
    if (input.quantityKg == null || input.quantityKg <= 0) badRequest('quantityKg must be positive');
    return this.mutate(security, async (session) => {
      const warehouse = await session.query<any>(`SELECT id, tenant_id, is_cold_store, status FROM agri_inventory.warehouses WHERE id=$1 AND deleted_at IS NULL`, [input.warehouseId]);
      if (!warehouse.rows[0]) notFound('warehouse', input.warehouseId);
      const tenantId = warehouse.rows[0].tenant_id;
      let cropId = input.cropId ?? null;
      if (input.harvestId) {
        const harvest = await session.query<any>(`SELECT * FROM agri_crop.harvests WHERE id=$1 AND deleted_at IS NULL`, [input.harvestId]);
        if (!harvest.rows[0]) notFound('harvest', input.harvestId);
        if (harvest.rows[0].tenant_id !== tenantId) badRequest('harvest belongs to a different tenant');
        const cycle = await session.query<any>(`SELECT crop_id FROM agri_crop.crop_cycles WHERE id=$1`, [harvest.rows[0].crop_cycle_id]);
        cropId = cycle.rows[0]?.crop_id ?? cropId;
        if (harvest.rows[0].moisture_pct != null && harvest.rows[0].moisture_pct > 14 && !warehouse.rows[0].is_cold_store) {
          badRequest('harvest moisture above 14% requires a cold store warehouse');
        }
      }
      const codeRes = await session.query<{ code: string }>(`SELECT agri_crop.generate_lot_code($1) AS code`, [tenantId]);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_crop.storage_lots (tenant_id, harvest_id, warehouse_id, lot_code, crop_id, quantity_kg, quantity_released_kg, status)
         VALUES ($1,$2,$3,$4,$5,$6,0,'IN_STORAGE') RETURNING id`,
        [tenantId, input.harvestId ?? null, input.warehouseId, codeRes.rows[0].code, cropId, input.quantityKg],
      );
      const row = await session.query(`SELECT * FROM agri_crop.storage_lots WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'storage_lot', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async releaseStorageLot(security: AgriSecurityContext, id: string, quantityKg: number): Promise<any> {
    if (quantityKg == null || quantityKg <= 0) badRequest('quantityKg must be positive');
    return this.mutate(security, async (session) => {
      const lot = await session.query<any>(`SELECT * FROM agri_crop.storage_lots WHERE id=$1 FOR UPDATE`, [id]);
      if (!lot.rows[0]) notFound('storage_lot', id);
      this.assertRowVisible(security, lot.rows[0], 'storage_lot', id);
      const remaining = Number(lot.rows[0].quantity_kg) - Number(lot.rows[0].quantity_released_kg);
      if (quantityKg > remaining) badRequest(`cannot release ${quantityKg}kg; only ${remaining}kg remains in lot`);
      const newReleased = Number(lot.rows[0].quantity_released_kg) + quantityKg;
      const status = newReleased >= Number(lot.rows[0].quantity_kg) ? 'RELEASED' : lot.rows[0].status;
      await session.query(`UPDATE agri_crop.storage_lots SET quantity_released_kg=$2, status=$3, updated_at=now() WHERE id=$1`, [id, newReleased, status]);
      const row = await session.query(`SELECT * FROM agri_crop.storage_lots WHERE id=$1`, [id]);
      return { before: lot.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'storage_lot', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }
}
