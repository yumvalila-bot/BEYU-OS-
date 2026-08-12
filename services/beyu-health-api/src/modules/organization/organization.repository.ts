import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class OrganizationRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async hierarchy(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const tenants = await session.query(`SELECT id, name, type FROM health_tenant.tenants WHERE id=$1`, [tenantId]);
      const facilities = await session.query(`SELECT f.id, f.name, f.type, f.code, (SELECT json_agg(d) FROM health_tenant.departments d WHERE d.facility_id=f.id) as departments FROM health_tenant.facilities f WHERE f.tenant_id=$1`, [tenantId]);
      const workforce = await session.query(`SELECT COUNT(*)::int as total_staff, COUNT(*) FILTER (WHERE employment_status='ACTIVE')::int as active_staff FROM health_workforce.practitioners WHERE tenant_id=$1`, [tenantId]);
      return { tenant: tenants.rows[0], facilities: facilities.rows, workforce: workforce.rows[0] };
    });
  }
}
