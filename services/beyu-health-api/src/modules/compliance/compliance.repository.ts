import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class ComplianceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async packs(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_compliance.compliance_packs ORDER BY country_code, name`);
      return rows.rows;
    });
  }
  async evidence(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT e.*, r.title as requirement_title, r.reference, p.name as pack_name FROM health_compliance.compliance_evidence e JOIN health_compliance.compliance_requirements r ON r.id=e.requirement_id JOIN health_compliance.compliance_packs p ON p.id=r.pack_id WHERE e.tenant_id=$1 ORDER BY e.created_at DESC LIMIT 100`, [tenantId]);
      return rows.rows;
    });
  }
  async incidents(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_compliance.incident_reports WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`, [tenantId]);
      return rows.rows;
    });
  }
  async dashboard(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const complianceScore = await session.query(`SELECT COUNT(*) FILTER (WHERE status='COMPLIANT')::int as compliant, COUNT(*)::int as total FROM health_compliance.compliance_evidence WHERE tenant_id=$1`, [tenantId]);
      const incidents = await session.query(`SELECT type, COUNT(*)::int as count FROM health_compliance.incident_reports WHERE tenant_id=$1 GROUP BY type`, [tenantId]);
      const auditViolations = await session.query(`SELECT COUNT(*)::int as suspicious_access FROM health_audit.access_logs WHERE tenant_id=$1 AND is_break_glass=true AND accessed_at > now() - interval '30 days'`, [tenantId]);
      return { complianceScore: complianceScore.rows[0], incidents: incidents.rows, auditViolations: auditViolations.rows[0] };
    });
  }
}
