import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class TenantRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const where = security.roles.includes('SUPER_ADMIN') ? '' : 'WHERE t.id = $1';
      const params = security.roles.includes('SUPER_ADMIN') ? [] : [security.tenantId];
      const rows = await session.query(`SELECT t.id, t.name, t.slug, t.type, t.status, t.country_code, t.created_at FROM health_tenant.tenants t ${where} ORDER BY t.name`, params);
      return rows.rows;
    });
  }
  async findById(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT t.*, (SELECT json_agg(f) FROM health_tenant.facilities f WHERE f.tenant_id=t.id) as facilities FROM health_tenant.tenants t WHERE t.id=$1`, [id]);
      if (!r.rows[0]) notFound('tenant', id);
      return r.rows[0];
    });
  }
  async facilities(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT f.id, f.name, f.type, f.code, f.status, f.address, f.contact_phone FROM health_tenant.facilities f WHERE f.tenant_id=$1 ORDER BY f.name`, [tenantId]);
      return rows.rows;
    });
  }
}
