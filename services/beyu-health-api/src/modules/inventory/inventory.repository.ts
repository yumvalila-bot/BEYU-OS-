import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class InventoryRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async warehouses(security: HealthSecurityContext, facilityId?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE w.tenant_id=$1`;
      if (facilityId) { params.push(facilityId); where += ` AND w.facility_id=$${params.length}`; }
      const rows = await session.query(`SELECT w.*, f.name as facility_name FROM health_inventory.warehouses w JOIN health_tenant.facilities f ON f.id=w.facility_id ${where} ORDER BY w.name`, params);
      return rows.rows;
    });
  }

  async items(security: HealthSecurityContext, query: { q?: string; category?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    if (query.q) { params.push(`%${query.q}%`); where.push(`(i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length})`); }
    if (query.category) { params.push(query.category); where.push(`i.category = $${params.length}`); }
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where.push(`i.tenant_id=$${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_inventory.items i ${clause}`, params);
      const rows = await session.query(`SELECT i.*, d.name as drug_name, COALESCE((SELECT SUM(quantity) FROM health_inventory.stock_batches sb WHERE sb.item_id=i.id),0) as total_stock, (SELECT json_agg(sb) FROM health_inventory.stock_batches sb WHERE sb.item_id=i.id) as batches FROM health_inventory.items i LEFT JOIN health_pharmacy.drugs d ON d.id=i.drug_id ${clause} ORDER BY i.name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async lowStock(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT i.id, i.name, i.sku, i.reorder_level, COALESCE(SUM(sb.quantity),0) as current_stock, i.category FROM health_inventory.items i LEFT JOIN health_inventory.stock_batches sb ON sb.item_id=i.id WHERE i.tenant_id=$1 AND i.status='ACTIVE' GROUP BY i.id HAVING COALESCE(SUM(sb.quantity),0) <= i.reorder_level ORDER BY current_stock ASC LIMIT 50`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }

  async movements(security: HealthSecurityContext, itemId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT m.*, u.display_name as performer_name, fw.name as from_warehouse_name, tw.name as to_warehouse_name FROM health_inventory.stock_movements m JOIN health_identity.users u ON u.id=m.performed_by LEFT JOIN health_inventory.warehouses fw ON fw.id=m.from_warehouse_id LEFT JOIN health_inventory.warehouses tw ON tw.id=m.to_warehouse_id WHERE m.item_id=$1 ORDER BY m.performed_at DESC LIMIT 100`, [itemId]);
      return rows.rows;
    });
  }

  async createMovement(security: HealthSecurityContext, input: { itemId: string; batchId?: string; fromWarehouseId?: string; toWarehouseId?: string; type: string; quantity: number; reason?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_inventory.stock_movements (tenant_id, item_id, batch_id, from_warehouse_id, to_warehouse_id, type, quantity, reason, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.itemId, input.batchId ?? null, input.fromWarehouseId ?? null, input.toWarehouseId ?? null, input.type, input.quantity, input.reason ?? null, security.userId]);
      if (input.type === 'RECEIPT' && input.batchId) {
        await session.query(`UPDATE health_inventory.stock_batches SET quantity = quantity + $1 WHERE id=$2`, [input.quantity, input.batchId]);
      } else if (input.type === 'ISSUE' && input.batchId) {
        await session.query(`UPDATE health_inventory.stock_batches SET quantity = GREATEST(0, quantity - $1) WHERE id=$2`, [input.quantity, input.batchId]);
      } else if (input.type === 'TRANSFER' && input.batchId && input.toWarehouseId) {
        // For transfer, reduce from source and create/increase batch in destination (simplified)
        await session.query(`UPDATE health_inventory.stock_batches SET quantity = quantity - $1 WHERE id=$2`, [input.quantity, input.batchId]);
      }
      return (await session.query(`SELECT * FROM health_inventory.stock_movements WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'stock_movement', resourceId: result.id, newState: result }));
  }

  async suppliers(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_inventory.suppliers WHERE tenant_id=$1 ORDER BY name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }

  async createItem(security: HealthSecurityContext, input: { sku: string; name: string; category: string; uom: string; isDrug?: boolean; drugId?: string; reorderLevel?: number; reorderQuantity?: number }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_inventory.items (tenant_id, sku, name, category, uom, is_drug, drug_id, reorder_level, reorder_quantity, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE') RETURNING id`,
        [tenantId, input.sku, input.name, input.category, input.uom, input.isDrug ?? false, input.drugId ?? null, input.reorderLevel ?? 10, input.reorderQuantity ?? 50]);
      return (await session.query(`SELECT * FROM health_inventory.items WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'inventory_item', resourceId: result.id, newState: result }));
  }

  async createBatch(security: HealthSecurityContext, input: { itemId: string; warehouseId: string; batchNumber: string; quantity: number; expiryDate?: string; unitCostMinor?: number }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_inventory.stock_batches (tenant_id, item_id, warehouse_id, batch_number, quantity, expiry_date, unit_cost_minor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, input.itemId, input.warehouseId, input.batchNumber, input.quantity, input.expiryDate ?? null, input.unitCostMinor ?? null]);
      // Also create receipt movement
      await session.query(`INSERT INTO health_inventory.stock_movements (tenant_id, item_id, batch_id, to_warehouse_id, type, quantity, performed_by, reason) VALUES ($1,$2,$3,$4,'RECEIPT',$5,$6,'Initial receipt')`, [tenantId, input.itemId, res.rows[0].id, input.warehouseId, input.quantity, security.userId]);
      return (await session.query(`SELECT * FROM health_inventory.stock_batches WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'stock_batch', resourceId: result.id, newState: result }));
  }

  async purchaseOrders(security: HealthSecurityContext, status?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE po.tenant_id=$1`;
      if (status) { params.push(status); where += ` AND po.status=$${params.length}`; }
      const rows = await session.query(`SELECT po.*, s.name as supplier_name FROM health_inventory.purchase_orders po JOIN health_inventory.suppliers s ON s.id=po.supplier_id ${where} ORDER BY po.created_at DESC LIMIT 100`, params);
      return rows.rows;
    });
  }
}
