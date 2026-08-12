import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class InventoryRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async items(security: HealthSecurityContext, query: { q?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    if (query.q) { params.push(`%${query.q}%`); where.push(`(i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length})`); }
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where.push(`i.tenant_id=$${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_inventory.items i ${clause}`, params);
      const rows = await session.query(`SELECT i.*, COALESCE((SELECT SUM(quantity) FROM health_inventory.stock_batches sb WHERE sb.item_id=i.id),0) as total_stock, (SELECT json_agg(sb) FROM health_inventory.stock_batches sb WHERE sb.item_id=i.id) as batches FROM health_inventory.items i ${clause} ORDER BY i.name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async lowStock(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT i.id, i.name, i.sku, i.reorder_level, COALESCE(SUM(sb.quantity),0) as current_stock FROM health_inventory.items i LEFT JOIN health_inventory.stock_batches sb ON sb.item_id=i.id WHERE i.tenant_id=$1 AND i.status='ACTIVE' GROUP BY i.id HAVING COALESCE(SUM(sb.quantity),0) <= i.reorder_level ORDER BY current_stock ASC LIMIT 50`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
  async movements(security: HealthSecurityContext, itemId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT m.*, u.display_name as performer_name FROM health_inventory.stock_movements m JOIN health_identity.users u ON u.id=m.performed_by WHERE m.item_id=$1 ORDER BY m.performed_at DESC LIMIT 100`, [itemId]);
      return rows.rows;
    });
  }
  async createMovement(security: HealthSecurityContext, input: { itemId: string; batchId?: string; fromWarehouseId?: string; toWarehouseId?: string; type: string; quantity: number; reason?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_inventory.stock_movements (tenant_id, item_id, batch_id, from_warehouse_id, to_warehouse_id, type, quantity, reason, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.itemId, input.batchId ?? null, input.fromWarehouseId ?? null, input.toWarehouseId ?? null, input.type, input.quantity, input.reason ?? null, security.userId]);
      // Adjust batch quantity
      if (input.type === 'RECEIPT' && input.batchId) {
        await session.query(`UPDATE health_inventory.stock_batches SET quantity = quantity + $1 WHERE id=$2`, [input.quantity, input.batchId]);
      } else if (input.type === 'ISSUE' && input.batchId) {
        await session.query(`UPDATE health_inventory.stock_batches SET quantity = quantity - $1 WHERE id=$2`, [input.quantity, input.batchId]);
      }
      return (await session.query(`SELECT * FROM health_inventory.stock_movements WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'stock_movement', resourceId: (result as any).id, newState: result as any }));
  }
}
