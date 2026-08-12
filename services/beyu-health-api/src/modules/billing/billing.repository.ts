import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class BillingRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async listInvoices(security: HealthSecurityContext, query: { patientId?: string; status?: string; facilityId?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('i.patient_id = ?', query.patientId);
    if (query.status) add('i.status = ?', query.status);
    if (query.facilityId) add('i.facility_id = ?', query.facilityId);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('i.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_billing.invoices i ${clause}`, params);
      const rows = await session.query(`SELECT i.*, p.first_name, p.last_name, p.mrn, f.name as facility_name FROM health_billing.invoices i JOIN health_patient.patients p ON p.id=i.patient_id LEFT JOIN health_tenant.facilities f ON f.id=i.facility_id ${clause} ORDER BY i.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async getInvoice(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const inv = await session.query(`SELECT i.*, p.first_name, p.last_name FROM health_billing.invoices i JOIN health_patient.patients p ON p.id=i.patient_id WHERE i.id=$1`, [id]);
      if (!inv.rows[0]) notFound('invoice', id);
      const lines = await session.query(`SELECT il.*, s.name as service_name FROM health_billing.invoice_lines il LEFT JOIN health_billing.service_catalog s ON s.id=il.service_id WHERE il.invoice_id=$1`, [id]);
      const payments = await session.query(`SELECT * FROM health_billing.payments WHERE invoice_id=$1 ORDER BY paid_at DESC`, [id]);
      return { ...inv.rows[0], lines: lines.rows, payments: payments.rows };
    });
  }

  async createInvoice(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; facilityId?: string; lines: Array<{ description: string; quantity: number; unitPriceMinor: number; serviceId?: string }>; discountMinor?: number; notes?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPriceMinor, 0);
      const discount = input.discountMinor ?? 0;
      const total = subtotal - discount;
      const res = await session.query<{ id: string }>(`INSERT INTO health_billing.invoices (tenant_id, patient_id, encounter_id, facility_id, invoice_number, status, subtotal_minor, discount_minor, total_minor, balance_minor, notes, created_by) VALUES ($1,$2,$3,$4,$5,'ISSUED',$6,$7,$8,$8,$9,$10) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, input.facilityId ?? null, invoiceNumber, subtotal, discount, total, input.notes ?? null, security.userId]);
      const invoiceId = res.rows[0].id;
      for (const line of input.lines) {
        const totalMinor = line.quantity * line.unitPriceMinor;
        await session.query(`INSERT INTO health_billing.invoice_lines (invoice_id, service_id, description, quantity, unit_price_minor, total_minor) VALUES ($1,$2,$3,$4,$5,$6)`,
          [invoiceId, line.serviceId ?? null, line.description, line.quantity, line.unitPriceMinor, totalMinor]);
      }
      // Emit financial event for Finance OS integration
      await session.query(`INSERT INTO health_integration.event_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload) VALUES ($1,'invoice',$2,'InvoiceIssued',$3)`, [tenantId, invoiceId, JSON.stringify({ invoiceId, invoiceNumber, patientId: input.patientId, totalMinor: total })]);
      return (await session.query(`SELECT * FROM health_billing.invoices WHERE id=$1`, [invoiceId])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'invoice', resourceId: result.id, newState: result }));
  }

  async addPayment(security: HealthSecurityContext, invoiceId: string, input: { amountMinor: number; method: string; reference?: string }) {
    return this.mutate(security, async (session) => {
      const invoice = await session.query(`SELECT * FROM health_billing.invoices WHERE id=$1`, [invoiceId]);
      if (!invoice.rows[0]) notFound('invoice', invoiceId);
      const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_billing.payments (tenant_id, invoice_id, payment_number, amount_minor, method, reference, received_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, invoiceId, paymentNumber, input.amountMinor, input.method, input.reference ?? null, security.userId]);
      await session.query(`UPDATE health_billing.invoices SET paid_minor = paid_minor + $1, balance_minor = total_minor - (paid_minor + $1), status = CASE WHEN total_minor <= (paid_minor + $1) THEN 'PAID' ELSE 'PARTIALLY_PAID' END, updated_at=now() WHERE id=$2`, [input.amountMinor, invoiceId]);
      await session.query(`INSERT INTO health_integration.event_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload) VALUES ($1,'payment',$2,'PaymentReceived',$3)`, [tenantId, res.rows[0].id, JSON.stringify({ invoiceId, paymentId: res.rows[0].id, amountMinor: input.amountMinor })]);
      return (await session.query(`SELECT * FROM health_billing.payments WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'payment', resourceId: result.id, newState: result }));
  }

  async serviceCatalog(security: HealthSecurityContext, query?: { q?: string; category?: string }) {
    return this.read(security, async (session) => {
      const params: unknown[] = []; let where = "s.status='ACTIVE'";
      if (query?.q) { params.push(`%${query.q}%`); where += ` AND (s.name ILIKE $${params.length} OR s.code ILIKE $${params.length})`; }
      if (query?.category) { params.push(query.category); where += ` AND s.category = $${params.length}`; }
      if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where += ` AND s.tenant_id=$${params.length}`; }
      const rows = await session.query(`SELECT s.* FROM health_billing.service_catalog s WHERE ${where} ORDER BY s.category, s.name LIMIT 100`, params);
      return rows.rows;
    });
  }

  async createService(security: HealthSecurityContext, input: { code: string; name: string; category: string; unitPriceMinor: number; currency?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_billing.service_catalog (tenant_id, code, name, category, unit_price_minor, currency, status) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`, [tenantId, input.code, input.name, input.category, input.unitPriceMinor, input.currency ?? 'TZS']);
      return (await session.query(`SELECT * FROM health_billing.service_catalog WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'service_item', resourceId: result.id, newState: result }));
  }

  async revenueSummary(security: HealthSecurityContext, period: 'today' | 'week' | 'month' | 'year' = 'month') {
    return this.read(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const intervals: Record<string, string> = { today: "1 day", week: "7 days", month: "30 days", year: "365 days" };
      const interval = intervals[period] ?? "30 days";
      const rows = await session.query(`SELECT DATE(i.created_at) as date, SUM(i.total_minor)::bigint as revenue, SUM(i.paid_minor)::bigint as collected, COUNT(*)::int as invoices FROM health_billing.invoices i WHERE i.tenant_id=$1 AND i.created_at > now() - interval '${interval}' GROUP BY DATE(i.created_at) ORDER BY date DESC`, [tenantId]).catch(() => ({ rows: [] }));
      const totals = await session.query(`SELECT SUM(total_minor)::bigint as total_revenue, SUM(paid_minor)::bigint as total_collected, SUM(balance_minor)::bigint as total_balance, COUNT(*)::int as total_invoices, COUNT(*) FILTER (WHERE status='OVERDUE')::int as overdue FROM health_billing.invoices WHERE tenant_id=$1`, [tenantId]);
      return { daily: (rows as any).rows ?? [], totals: totals.rows[0] };
    });
  }
}
