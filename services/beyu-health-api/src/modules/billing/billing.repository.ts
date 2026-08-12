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

  async listInvoices(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('i.patient_id = ?', query.patientId);
    if (query.status) add('i.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('i.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_billing.invoices i ${clause}`, params);
      const rows = await session.query(`SELECT i.*, p.first_name, p.last_name FROM health_billing.invoices i JOIN health_patient.patients p ON p.id=i.patient_id ${clause} ORDER BY i.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createInvoice(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; lines: Array<{ description: string; quantity: number; unitPriceMinor: number; serviceId?: string }>; discountMinor?: number }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPriceMinor, 0);
      const discount = input.discountMinor ?? 0;
      const total = subtotal - discount;
      const res = await session.query<{ id: string }>(`INSERT INTO health_billing.invoices (tenant_id, patient_id, encounter_id, invoice_number, status, subtotal_minor, total_minor, balance_minor, created_by) VALUES ($1,$2,$3,$4,'ISSUED',$5,$6,$6,$7) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, invoiceNumber, subtotal, total, security.userId]);
      const invoiceId = res.rows[0].id;
      for (const line of input.lines) {
        const totalMinor = line.quantity * line.unitPriceMinor;
        await session.query(`INSERT INTO health_billing.invoice_lines (invoice_id, service_id, description, quantity, unit_price_minor, total_minor) VALUES ($1,$2,$3,$4,$5,$6)`,
          [invoiceId, line.serviceId ?? null, line.description, line.quantity, line.unitPriceMinor, totalMinor]);
      }
      return (await session.query(`SELECT * FROM health_billing.invoices WHERE id=$1`, [invoiceId])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'invoice', resourceId: (result as any).id, newState: result as any }));
  }

  async addPayment(security: HealthSecurityContext, invoiceId: string, input: { amountMinor: number; method: string; reference?: string }) {
    return this.mutate(security, async (session) => {
      const invoice = await session.query(`SELECT * FROM health_billing.invoices WHERE id=$1`, [invoiceId]);
      if (!invoice.rows[0]) notFound('invoice', invoiceId);
      const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_billing.payments (tenant_id, invoice_id, payment_number, amount_minor, method, reference, received_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, invoiceId, paymentNumber, input.amountMinor, input.method, input.reference ?? null, security.userId]);
      // Update invoice
      await session.query(`UPDATE health_billing.invoices SET paid_minor = paid_minor + $1, balance_minor = total_minor - (paid_minor + $1), status = CASE WHEN total_minor <= (paid_minor + $1) THEN 'PAID' ELSE 'PARTIALLY_PAID' END, updated_at=now() WHERE id=$2`, [input.amountMinor, invoiceId]);
      return (await session.query(`SELECT * FROM health_billing.payments WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'payment', resourceId: (result as any).id, newState: result as any }));
  }

  async serviceCatalog(security: HealthSecurityContext, q?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = []; let where = "s.status='ACTIVE'";
      if (q) { params.push(`%${q}%`); where += ` AND s.name ILIKE $${params.length}`; }
      if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where += ` AND s.tenant_id=$${params.length}`; }
      const rows = await session.query(`SELECT s.* FROM health_billing.service_catalog s WHERE ${where} ORDER BY s.name LIMIT 100`, params);
      return rows.rows;
    });
  }
}
