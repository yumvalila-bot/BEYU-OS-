import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class InsuranceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async payers(security: HealthSecurityContext) {
    return this.read(security, async (s) => {
      const rows = await s.query(`SELECT * FROM health_insurance.payers WHERE tenant_id=$1 ORDER BY name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
  async claims(security: HealthSecurityContext, query: { patientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.patientId) add('c.patient_id = ?', query.patientId);
    if (query.status) add('c.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('c.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_insurance.claims c ${clause}`, params);
      const rows = await session.query(`SELECT c.*, p.name as payer_name FROM health_insurance.claims c JOIN health_insurance.payers p ON p.id=c.payer_id ${clause} ORDER BY c.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async createClaim(security: HealthSecurityContext, input: { patientId: string; encounterId?: string; payerId: string; invoiceId?: string; totalMinor: number; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_insurance.claims (tenant_id, patient_id, encounter_id, payer_id, invoice_id, claim_number, total_minor, claimed_minor, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'DRAFT',$8) RETURNING id`,
        [tenantId, input.patientId, input.encounterId ?? null, input.payerId, input.invoiceId ?? null, claimNumber, input.totalMinor, security.userId]);
      return (await session.query(`SELECT * FROM health_insurance.claims WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'insurance_claim', resourceId: (result as any).id, newState: result }));
  }
  async submitClaim(security: HealthSecurityContext, id: string) {
    return this.mutate(security, async (session) => {
      const r = await session.query(`SELECT * FROM health_insurance.claims WHERE id=$1`, [id]);
      if (!r.rows[0]) notFound('claim', id);
      const updated = await session.query(`UPDATE health_insurance.claims SET status='SUBMITTED', submitted_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [id]);
      return updated.rows[0];
    }, (result: any) => ({ action: 'UPDATE', resourceType: 'insurance_claim', resourceId: id, newState: result }));
  }
}
