import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class WorkforceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext, query: { q?: string; facilityId?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.q) { params.push(`%${query.q}%`); where.push(`(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.code ILIKE $${params.length})`); }
    if (query.facilityId) add('p.primary_facility_id = ?', query.facilityId);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('p.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_workforce.practitioners p ${clause}`, params);
      const rows = await session.query(`SELECT p.* FROM health_workforce.practitioners p ${clause} ORDER BY p.last_name, p.first_name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async shifts(security: HealthSecurityContext, practitionerId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT s.* FROM health_workforce.shifts s WHERE s.practitioner_id=$1 ORDER BY s.start DESC LIMIT 50`, [practitionerId]);
      return rows.rows;
    });
  }
  async createShift(security: HealthSecurityContext, input: { practitionerId: string; facilityId: string; start: string; end: string; type: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const shiftNumber = `SHIFT-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_workforce.shifts (tenant_id, practitioner_id, facility_id, shift_number, start, "end", type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, input.practitionerId, input.facilityId, shiftNumber, input.start, input.end, input.type]);
      return (await session.query(`SELECT * FROM health_workforce.shifts WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'shift', resourceId: (result as any).id, newState: result as any }));
  }
}
