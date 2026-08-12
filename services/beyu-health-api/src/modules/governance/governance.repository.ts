import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class GovernanceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async policies(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_governance.policies WHERE tenant_id=$1 OR tenant_id IS NULL ORDER BY category, name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
  async approvals(security: HealthSecurityContext, status?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE ar.tenant_id=$1`;
      if (status) { params.push(status); where += ` AND ar.status=$${params.length}`; }
      const rows = await session.query(`SELECT ar.*, w.name as workflow_name FROM health_governance.approval_requests ar JOIN health_governance.approval_workflows w ON w.id=ar.workflow_id ${where} ORDER BY ar.created_at DESC LIMIT 100`, params);
      return rows.rows;
    });
  }
  async qualityIndicators(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_governance.quality_indicators WHERE tenant_id=$1 ORDER BY category, name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
}
