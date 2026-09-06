import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/**
 * Suppliers, buyers, purchase orders, sales orders and trade contracts.
 *
 * FINANCE OS BOUNDARY: monetary amounts here are operational facts.
 * finance_status tracks reconciliation with BEYU FINANCE OS, which owns
 * the ledger. Nothing here posts to any account.
 */
@Injectable()
export class ProcurementRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Suppliers & buyers ────────────────────────────────────────────────

  async listCounterparties(security: AgriSecurityContext, kind: 'SUPPLIER' | 'BUYER', query: { q?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const table = kind === 'SUPPLIER' ? 'agri_procurement.suppliers' : 'agri_procurement.buyers';
    const where: string[] = ['cp.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`cp.tenant_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(cp.name ILIKE $${params.length} OR cp.code ILIKE $${params.length})`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} cp ${clause}`, params);
      const rows = await session.query(`SELECT cp.* FROM ${table} cp ${clause} ORDER BY cp.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createCounterparty(security: AgriSecurityContext, kind: 'SUPPLIER' | 'BUYER', input: { tenantId?: string; code: string; name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; country?: string | null }): Promise<any> {
    if (!input.code || !input.name) badRequest('code and name are required');
    const tenantId = this.tenantOf(security, input.tenantId);
    if (!tenantId) badRequest('tenant membership required');
    const table = kind === 'SUPPLIER' ? 'agri_procurement.suppliers' : 'agri_procurement.buyers';
    return this.mutate(security, async (session) => {
      const dupe = await session.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, [tenantId, input.code]);
      if (dupe.rows[0]) conflict(`${kind.toLowerCase()} code already exists in tenant`);
      const res = await session.query<{ id: string }>(
        `INSERT INTO ${table} (tenant_id, code, name, contact_person, phone, email, country, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`,
        [tenantId, input.code, input.name, input.contactPerson ?? null, input.phone ?? null, input.email ?? null, input.country ?? null],
      );
      const row = await session.query(`SELECT * FROM ${table} WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: kind === 'SUPPLIER' ? 'supplier' : 'buyer', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Purchase orders ───────────────────────────────────────────────────

  async listPurchaseOrders(security: AgriSecurityContext, query: { status?: string; supplierId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['po.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`po.tenant_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`po.status = $${params.length}`); }
    if (query.supplierId) { params.push(query.supplierId); where.push(`po.supplier_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_procurement.purchase_orders po ${clause}`, params);
      const rows = await session.query(
        `SELECT po.*, s.name AS supplier_name FROM agri_procurement.purchase_orders po
         JOIN agri_procurement.suppliers s ON s.id=po.supplier_id ${clause}
         ORDER BY po.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      const items = [];
      for (const po of rows.rows) {
        const lines = await session.query(`SELECT * FROM agri_procurement.purchase_order_lines WHERE purchase_order_id=$1 ORDER BY id`, [po.id]);
        items.push({ ...po, lines: lines.rows });
      }
      return { items, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createPurchaseOrder(security: AgriSecurityContext, input: { tenantId?: string; supplierId: string; orderDate: string; expectedDeliveryOn?: string | null; currency: string; notes?: string | null; lines: Array<{ itemType?: string; itemId?: string | null; description: string; quantity: number; unit: string; unitPrice: number }> }): Promise<any> {
    if (!input.supplierId || !input.orderDate || !input.currency) badRequest('supplierId, orderDate and currency are required');
    if (!input.lines?.length) badRequest('at least one line is required');
    for (const [i, line] of input.lines.entries()) {
      if (!line.description || line.quantity == null || line.unitPrice == null || !line.unit) badRequest(`line ${i + 1}: description, quantity, unit and unitPrice are required`);
      if (line.quantity <= 0 || line.unitPrice < 0) badRequest(`line ${i + 1}: quantity must be positive and unitPrice non-negative`);
    }
    return this.mutate(security, async (session) => {
      const supplier = await session.query(`SELECT id, tenant_id FROM agri_procurement.suppliers WHERE id=$1 AND deleted_at IS NULL`, [input.supplierId]);
      if (!supplier.rows[0]) notFound('supplier', input.supplierId);
      const tenantId = supplier.rows[0].tenant_id;
      const myTenant = this.tenantOf(security, input.tenantId);
      if (myTenant && tenantId !== myTenant && !security.roles.includes('SUPER_ADMIN')) badRequest('supplier belongs to a different tenant');
      const numberRes = await session.query<{ number: string }>(`SELECT agri_procurement.generate_po_number($1) AS number`, [tenantId]);
      const total = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_procurement.purchase_orders (tenant_id, po_number, supplier_id, status, order_date, expected_delivery_on, currency, total_amount, finance_status, notes, created_by)
         VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7,'NOT_APPLICABLE',$8,$9) RETURNING id`,
        [tenantId, numberRes.rows[0].number, input.supplierId, input.orderDate, input.expectedDeliveryOn ?? null, input.currency, total, input.notes ?? null, security.userId],
      );
      const poId = res.rows[0].id;
      for (const line of input.lines) {
        await session.query(
          `INSERT INTO agri_procurement.purchase_order_lines (purchase_order_id, item_type, item_id, description, quantity, unit, unit_price, currency, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [poId, line.itemType ?? 'INPUT_ITEM', line.itemId ?? null, line.description, line.quantity, line.unit, line.unitPrice, input.currency, line.quantity * line.unitPrice],
        );
      }
      const row = await session.query(`SELECT * FROM agri_procurement.purchase_orders WHERE id=$1`, [poId]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'purchase_order', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async transitionPurchaseOrder(security: AgriSecurityContext, id: string, target: string): Promise<any> {
    const allowed: Record<string, string[]> = {
      SUBMITTED: ['DRAFT'],
      APPROVED: ['SUBMITTED'],
      REJECTED: ['SUBMITTED'],
      FULFILLED: ['APPROVED'],
      CLOSED: ['APPROVED', 'FULFILLED'],
      CANCELLED: ['DRAFT', 'SUBMITTED', 'APPROVED'],
    };
    return this.mutate(security, async (session) => {
      const po = await session.query<any>(`SELECT * FROM agri_procurement.purchase_orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!po.rows[0]) notFound('purchase_order', id);
      this.assertRowVisible(security, po.rows[0], 'purchase_order', id);
      const from = po.rows[0].status;
      if (!allowed[target]) badRequest(`unknown status ${target}`);
      if (!allowed[target].includes(from)) conflict(`cannot transition purchase order from ${from} to ${target}`);
      const financeStatus = target === 'FULFILLED' ? 'PENDING_INTEGRATION' : po.rows[0].finance_status;
      await session.query(`UPDATE agri_procurement.purchase_orders SET status=$2, finance_status=$3, updated_at=now() WHERE id=$1`, [id, target, financeStatus]);
      const row = await session.query(`SELECT * FROM agri_procurement.purchase_orders WHERE id=$1`, [id]);
      return { before: po.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: target === 'APPROVED' || target === 'REJECTED' ? 'APPROVE' : 'UPDATE',
      resourceType: 'purchase_order', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  // ── Sales orders ──────────────────────────────────────────────────────

  async listSalesOrders(security: AgriSecurityContext, query: { status?: string; buyerId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['so.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`so.tenant_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`so.status = $${params.length}`); }
    if (query.buyerId) { params.push(query.buyerId); where.push(`so.buyer_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_procurement.sales_orders so ${clause}`, params);
      const rows = await session.query(
        `SELECT so.*, b.name AS buyer_name FROM agri_procurement.sales_orders so
         JOIN agri_procurement.buyers b ON b.id=so.buyer_id ${clause}
         ORDER BY so.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      const items = [];
      for (const so of rows.rows) {
        const lines = await session.query(`SELECT * FROM agri_procurement.sales_order_lines WHERE sales_order_id=$1 ORDER BY id`, [so.id]);
        items.push({ ...so, lines: lines.rows });
      }
      return { items, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createSalesOrder(security: AgriSecurityContext, input: { tenantId?: string; buyerId: string; orderDate: string; storageLotId?: string | null; currency: string; notes?: string | null; lines: Array<{ description: string; quantity: number; unit: string; unitPrice: number }> }): Promise<any> {
    if (!input.buyerId || !input.orderDate || !input.currency) badRequest('buyerId, orderDate and currency are required');
    if (!input.lines?.length) badRequest('at least one line is required');
    for (const [i, line] of input.lines.entries()) {
      if (!line.description || line.quantity == null || line.unitPrice == null || !line.unit) badRequest(`line ${i + 1}: description, quantity, unit and unitPrice are required`);
      if (line.quantity <= 0 || line.unitPrice < 0) badRequest(`line ${i + 1}: quantity must be positive and unitPrice non-negative`);
    }
    return this.mutate(security, async (session) => {
      const buyer = await session.query(`SELECT id, tenant_id FROM agri_procurement.buyers WHERE id=$1 AND deleted_at IS NULL`, [input.buyerId]);
      if (!buyer.rows[0]) notFound('buyer', input.buyerId);
      const tenantId = buyer.rows[0].tenant_id;
      const myTenant = this.tenantOf(security, input.tenantId);
      if (myTenant && tenantId !== myTenant && !security.roles.includes('SUPER_ADMIN')) badRequest('buyer belongs to a different tenant');
      let lotKgRemaining: number | null = null;
      if (input.storageLotId) {
        const lot = await session.query<any>(`SELECT * FROM agri_crop.storage_lots WHERE id=$1`, [input.storageLotId]);
        if (!lot.rows[0]) notFound('storage_lot', input.storageLotId);
        if (lot.rows[0].tenant_id !== tenantId) badRequest('storage lot belongs to a different tenant');
        lotKgRemaining = Number(lot.rows[0].quantity_kg) - Number(lot.rows[0].quantity_released_kg);
        const soldKg = input.lines.filter(l => l.unit === 'kg').reduce((s, l) => s + l.quantity, 0);
        if (soldKg > lotKgRemaining) badRequest(`storage lot has only ${lotKgRemaining}kg unreleased; order asks ${soldKg}kg`);
      }
      const numberRes = await session.query<{ number: string }>(`SELECT agri_procurement.generate_so_number($1) AS number`, [tenantId]);
      const total = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_procurement.sales_orders (tenant_id, so_number, buyer_id, status, order_date, storage_lot_id, currency, total_amount, finance_status, notes, created_by)
         VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7,'NOT_APPLICABLE',$8,$9) RETURNING id`,
        [tenantId, numberRes.rows[0].number, input.buyerId, input.orderDate, input.storageLotId ?? null, input.currency, total, input.notes ?? null, security.userId],
      );
      const soId = res.rows[0].id;
      for (const line of input.lines) {
        await session.query(
          `INSERT INTO agri_procurement.sales_order_lines (sales_order_id, description, quantity, unit, unit_price, currency, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [soId, line.description, line.quantity, line.unit, line.unitPrice, input.currency, line.quantity * line.unitPrice],
        );
      }
      const row = await session.query(`SELECT * FROM agri_procurement.sales_orders WHERE id=$1`, [soId]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'sales_order', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async transitionSalesOrder(security: AgriSecurityContext, id: string, target: string): Promise<any> {
    const allowed: Record<string, string[]> = {
      SUBMITTED: ['DRAFT'],
      APPROVED: ['SUBMITTED'],
      REJECTED: ['SUBMITTED'],
      FULFILLED: ['APPROVED'],
      CLOSED: ['APPROVED', 'FULFILLED'],
      CANCELLED: ['DRAFT', 'SUBMITTED', 'APPROVED'],
    };
    return this.mutate(security, async (session) => {
      const so = await session.query<any>(`SELECT * FROM agri_procurement.sales_orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!so.rows[0]) notFound('sales_order', id);
      this.assertRowVisible(security, so.rows[0], 'sales_order', id);
      const from = so.rows[0].status;
      if (!allowed[target]) badRequest(`unknown status ${target}`);
      if (!allowed[target].includes(from)) conflict(`cannot transition sales order from ${from} to ${target}`);
      const financeStatus = target === 'FULFILLED' ? 'PENDING_INTEGRATION' : so.rows[0].finance_status;
      await session.query(`UPDATE agri_procurement.sales_orders SET status=$2, finance_status=$3, updated_at=now() WHERE id=$1`, [id, target, financeStatus]);
      if (target === 'FULFILLED' && so.rows[0].storage_lot_id) {
        const lot = await session.query<any>(`SELECT * FROM agri_crop.storage_lots WHERE id=$1 FOR UPDATE`, [so.rows[0].storage_lot_id]);
        const lines = await session.query(`SELECT * FROM agri_procurement.sales_order_lines WHERE sales_order_id=$1`, [id]);
        const soldKg = lines.rows.filter((l: any) => l.unit === 'kg').reduce((s: number, l: any) => s + Number(l.quantity), 0);
        const newReleased = Number(lot.rows[0].quantity_released_kg) + soldKg;
        const status = newReleased >= Number(lot.rows[0].quantity_kg) ? 'RELEASED' : lot.rows[0].status;
        await session.query(`UPDATE agri_crop.storage_lots SET quantity_released_kg=$2, status=$3, updated_at=now() WHERE id=$1`, [so.rows[0].storage_lot_id, newReleased, status]);
      }
      const row = await session.query(`SELECT * FROM agri_procurement.sales_orders WHERE id=$1`, [id]);
      return { before: so.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: target === 'APPROVED' || target === 'REJECTED' ? 'APPROVE' : 'UPDATE',
      resourceType: 'sales_order', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  // ── Contracts ─────────────────────────────────────────────────────────

  async listContracts(security: AgriSecurityContext, query: { status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['tc.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`tc.tenant_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`tc.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_procurement.trade_contracts tc ${clause}`, params);
      const rows = await session.query(`SELECT tc.* FROM agri_procurement.trade_contracts tc ${clause} ORDER BY tc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createContract(security: AgriSecurityContext, input: { tenantId?: string; counterpartyType: 'SUPPLIER' | 'BUYER'; counterpartyId: string; startDate: string; endDate?: string | null; currency: string; contractedValue: number; terms?: string | null }): Promise<any> {
    if (!input.counterpartyId || !input.startDate || !input.currency) badRequest('counterpartyId, startDate and currency are required');
    if (input.contractedValue == null || input.contractedValue < 0) badRequest('contractedValue must be non-negative');
    return this.mutate(security, async (session) => {
      const table = input.counterpartyType === 'SUPPLIER' ? 'agri_procurement.suppliers' : 'agri_procurement.buyers';
      const cp = await session.query(`SELECT id, tenant_id FROM ${table} WHERE id=$1 AND deleted_at IS NULL`, [input.counterpartyId]);
      if (!cp.rows[0]) notFound(input.counterpartyType.toLowerCase(), input.counterpartyId);
      const tenantId = cp.rows[0].tenant_id;
      const myTenant = this.tenantOf(security, input.tenantId);
      if (myTenant && tenantId !== myTenant && !security.roles.includes('SUPER_ADMIN')) badRequest('counterparty belongs to a different tenant');
      const numberRes = await session.query<{ number: string }>(`SELECT agri_procurement.generate_contract_number($1) AS number`, [tenantId]);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_procurement.trade_contracts (tenant_id, contract_number, counterparty_type, counterparty_id, status, start_date, end_date, currency, contracted_value, finance_status, terms, created_by)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,'PENDING_INTEGRATION',$9,$10) RETURNING id`,
        [tenantId, numberRes.rows[0].number, input.counterpartyType, input.counterpartyId, input.startDate, input.endDate ?? null, input.currency, input.contractedValue, input.terms ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_procurement.trade_contracts WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'contract', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async transitionContract(security: AgriSecurityContext, id: string, target: string): Promise<any> {
    const allowed: Record<string, string[]> = {
      ACTIVE: ['DRAFT'],
      COMPLETED: ['ACTIVE'],
      TERMINATED: ['ACTIVE'],
      DISPUTED: ['ACTIVE'],
    };
    return this.mutate(security, async (session) => {
      const tc = await session.query<any>(`SELECT * FROM agri_procurement.trade_contracts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!tc.rows[0]) notFound('contract', id);
      this.assertRowVisible(security, tc.rows[0], 'contract', id);
      if (!allowed[target]) badRequest(`unknown status ${target}`);
      if (!allowed[target].includes(tc.rows[0].status)) conflict(`cannot transition contract from ${tc.rows[0].status} to ${target}`);
      await session.query(`UPDATE agri_procurement.trade_contracts SET status=$2, updated_at=now() WHERE id=$1`, [id, target]);
      const row = await session.query(`SELECT * FROM agri_procurement.trade_contracts WHERE id=$1`, [id]);
      return { before: tc.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'contract', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }
}
