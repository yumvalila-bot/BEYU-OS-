import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database, DatabaseSession } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/** Warehouses, input items and stock movements. */
@Injectable()
export class InventoryRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Warehouses ────────────────────────────────────────────────────────

  async listWarehouses(security: AgriSecurityContext, query: { q?: string; farmId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['w.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`w.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`w.farm_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(w.name ILIKE $${params.length} OR w.code ILIKE $${params.length})`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_inventory.warehouses w ${clause}`, params);
      const rows = await session.query(`SELECT w.* FROM agri_inventory.warehouses w ${clause} ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createWarehouse(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; code: string; name: string; warehouseType: string; isColdStore?: boolean; capacityKg?: number | null }): Promise<any> {
    if (!input.code || !input.name || !input.warehouseType) badRequest('code, name and warehouseType are required');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.farmId) {
        const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        tenantId = farm.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('tenantId or tenant membership required');
      const dupe = await session.query(`SELECT id FROM agri_inventory.warehouses WHERE tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, [tenantId, input.code]);
      if (dupe.rows[0]) conflict('warehouse code already exists in tenant');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_inventory.warehouses (tenant_id, farm_id, code, name, warehouse_type, is_cold_store, capacity_kg, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`,
        [tenantId, input.farmId ?? null, input.code, input.name, input.warehouseType, input.isColdStore ?? false, input.capacityKg ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_inventory.warehouses WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'warehouse', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Input items ───────────────────────────────────────────────────────

  async listInputItems(security: AgriSecurityContext, query: { q?: string; category?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`i.tenant_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(i.name ILIKE $${params.length} OR i.code ILIKE $${params.length})`); }
    if (query.category) { params.push(query.category); where.push(`i.category = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_inventory.input_items i ${clause}`, params);
      const rows = await session.query(`SELECT i.* FROM agri_inventory.input_items i ${clause} ORDER BY i.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createInputItem(security: AgriSecurityContext, input: { tenantId?: string; code: string; name: string; category: string; unit: string; manufacturer?: string | null; isRestricted?: boolean }): Promise<any> {
    if (!input.code || !input.name || !input.category || !input.unit) badRequest('code, name, category and unit are required');
    const tenantId = this.tenantOf(security, input.tenantId);
    if (!tenantId) badRequest('tenant membership required');
    return this.mutate(security, async (session) => {
      const dupe = await session.query(`SELECT id FROM agri_inventory.input_items WHERE tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, [tenantId, input.code]);
      if (dupe.rows[0]) conflict('input item code already exists in tenant');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_inventory.input_items (tenant_id, code, name, category, unit, manufacturer, is_restricted, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`,
        [tenantId, input.code, input.name, input.category, input.unit, input.manufacturer ?? null, input.isRestricted ?? false],
      );
      const row = await session.query(`SELECT * FROM agri_inventory.input_items WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'input_item', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Stock movements ───────────────────────────────────────────────────

  async listStockMovements(security: AgriSecurityContext, query: { warehouseId?: string; inputItemId?: string; movementType?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`sm.tenant_id = $${params.length}`); }
    if (query.warehouseId) { params.push(query.warehouseId); where.push(`sm.warehouse_id = $${params.length}`); }
    if (query.inputItemId) { params.push(query.inputItemId); where.push(`sm.input_item_id = $${params.length}`); }
    if (query.movementType) { params.push(query.movementType); where.push(`sm.movement_type = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_inventory.stock_movements sm ${clause}`, params);
      const rows = await session.query(
        `SELECT sm.*, w.code AS warehouse_code, i.name AS input_item_name FROM agri_inventory.stock_movements sm
         LEFT JOIN agri_inventory.warehouses w ON w.id=sm.warehouse_id
         LEFT JOIN agri_inventory.input_items i ON i.id=sm.input_item_id
         ${clause} ORDER BY sm.occurred_on DESC, sm.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async stockBalance(session: DatabaseSession, tenantId: string, warehouseId: string, inputItemId: string): Promise<number> {
    const r = await session.query<{ balance: string }>(
      `SELECT COALESCE(SUM(CASE movement_type WHEN 'PURCHASE' THEN quantity WHEN 'RETURN' THEN quantity ELSE -quantity END), 0)::text AS balance
       FROM agri_inventory.stock_movements WHERE tenant_id=$1 AND warehouse_id=$2 AND input_item_id=$3`,
      [tenantId, warehouseId, inputItemId],
    );
    return Number(r.rows[0].balance);
  }

  /**
   * Records a stock movement. Invariant: on-hand balance per
   * (warehouse, input item) can never go negative — enforced inside the
   * same transaction that appends the movement.
   */
  async createStockMovement(security: AgriSecurityContext, input: { warehouseId: string; inputItemId?: string | null; storageLotId?: string | null; movementType: string; quantity: number; unit: string; occurredOn?: string; referenceType?: string | null; referenceId?: string | null; notes?: string | null }): Promise<any> {
    if (!input.warehouseId) badRequest('warehouseId is required');
    if (!input.movementType) badRequest('movementType is required');
    if (input.quantity == null || input.quantity <= 0) badRequest('quantity must be positive');
    if (!input.inputItemId && !input.storageLotId) badRequest('inputItemId or storageLotId is required');
    return this.mutate(security, async (session) => {
      const warehouse = await session.query<any>(`SELECT id, tenant_id FROM agri_inventory.warehouses WHERE id=$1 AND deleted_at IS NULL`, [input.warehouseId]);
      if (!warehouse.rows[0]) notFound('warehouse', input.warehouseId);
      const tenantId = warehouse.rows[0].tenant_id;
      if (input.inputItemId) {
        const item = await session.query<any>(`SELECT id, tenant_id, unit, is_restricted FROM agri_inventory.input_items WHERE id=$1 AND deleted_at IS NULL`, [input.inputItemId]);
        if (!item.rows[0]) notFound('input_item', input.inputItemId);
        if (item.rows[0].tenant_id !== tenantId) badRequest('input item belongs to a different tenant');
        const isStockIncrease = input.movementType === 'PURCHASE' || input.movementType === 'RETURN';
        if (!isStockIncrease) {
          const balance = await this.stockBalance(session, tenantId, input.warehouseId, input.inputItemId);
          if (input.quantity > balance) badRequest(`insufficient stock: balance ${balance} ${item.rows[0].unit}, requested ${input.quantity}`);
        }
      }
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_inventory.stock_movements (tenant_id, warehouse_id, input_item_id, storage_lot_id, movement_type, quantity, unit, reference_type, reference_id, occurred_on, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, input.warehouseId, input.inputItemId ?? null, input.storageLotId ?? null, input.movementType, input.quantity, input.unit, input.referenceType ?? null, input.referenceId ?? null, input.occurredOn ?? new Date().toISOString().slice(0, 10), input.notes ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_inventory.stock_movements WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'stock_movement', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async stockSummary(security: AgriSecurityContext, query: { warehouseId?: string }): Promise<any> {
    const tenantId = this.tenantOf(security);
    return this.read(security, async (session) => {
      const params: unknown[] = [];
      let tenantFilter = '';
      if (tenantId) { params.push(tenantId); tenantFilter = `AND sm.tenant_id=$${params.length}`; }
      let whFilter = '';
      if (query.warehouseId) { params.push(query.warehouseId); whFilter = `AND sm.warehouse_id=$${params.length}`; }
      const rows = await session.query(
        `SELECT sm.warehouse_id, w.code AS warehouse_code, sm.input_item_id, i.name AS input_item_name, i.unit,
                SUM(CASE sm.movement_type WHEN 'PURCHASE' THEN sm.quantity WHEN 'RETURN' THEN sm.quantity ELSE -sm.quantity END) AS on_hand
         FROM agri_inventory.stock_movements sm
         JOIN agri_inventory.warehouses w ON w.id=sm.warehouse_id
         LEFT JOIN agri_inventory.input_items i ON i.id=sm.input_item_id
         WHERE 1=1 ${tenantFilter} ${whFilter}
         GROUP BY sm.warehouse_id, w.code, sm.input_item_id, i.name, i.unit
         HAVING SUM(CASE sm.movement_type WHEN 'PURCHASE' THEN sm.quantity WHEN 'RETURN' THEN sm.quantity ELSE -sm.quantity END) > 0
         ORDER BY w.code, i.name`,
        params,
      );
      return { items: rows.rows };
    });
  }
}
