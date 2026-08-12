import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class ComplianceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async packs(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT p.*, COUNT(r.id)::int as requirement_count FROM health_compliance.compliance_packs p LEFT JOIN health_compliance.compliance_requirements r ON r.pack_id=p.id GROUP BY p.id ORDER BY p.country_code, p.name`);
      return rows.rows;
    });
  }

  async requirements(security: HealthSecurityContext, packId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_compliance.compliance_requirements WHERE pack_id=$1 ORDER BY reference`, [packId]);
      return rows.rows;
    });
  }

  async evidence(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT e.*, r.title as requirement_title, r.reference, r.category, p.name as pack_name, p.code as pack_code, u.display_name as assessor_name FROM health_compliance.compliance_evidence e JOIN health_compliance.compliance_requirements r ON r.id=e.requirement_id JOIN health_compliance.compliance_packs p ON p.id=r.pack_id LEFT JOIN health_identity.users u ON u.id=e.assessed_by WHERE e.tenant_id=$1 ORDER BY e.created_at DESC LIMIT 100`, [tenantId]);
      return rows.rows;
    });
  }

  async createEvidence(security: HealthSecurityContext, input: { tenantId: string; facilityId?: string; requirementId: string; status: string; evidenceText?: string; evidenceUrl?: string; expiryDate?: string }) {
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_compliance.compliance_evidence (tenant_id, facility_id, requirement_id, status, evidence_text, evidence_url, assessed_by, assessed_at, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8) RETURNING id`, [input.tenantId, input.facilityId ?? null, input.requirementId, input.status, input.evidenceText ?? null, input.evidenceUrl ?? null, security.userId, input.expiryDate ?? null]);
      return (await session.query(`SELECT * FROM health_compliance.compliance_evidence WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'compliance_evidence', resourceId: result.id, newState: result }));
  }

  async incidents(security: HealthSecurityContext, tenantId: string, query?: { type?: string; severity?: string; status?: string }) {
    return this.read(security, async (session) => {
      const params: unknown[] = [tenantId];
      let where = `WHERE ir.tenant_id=$1`;
      if (query?.type) { params.push(query.type); where += ` AND ir.type=$${params.length}`; }
      if (query?.severity) { params.push(query.severity); where += ` AND ir.severity=$${params.length}`; }
      if (query?.status) { params.push(query.status); where += ` AND ir.status=$${params.length}`; }
      const rows = await session.query(`SELECT ir.*, f.name as facility_name, u.display_name as reporter_name FROM health_compliance.incident_reports ir LEFT JOIN health_tenant.facilities f ON f.id=ir.facility_id JOIN health_identity.users u ON u.id=ir.reported_by ${where} ORDER BY ir.created_at DESC LIMIT 100`, params);
      return rows.rows;
    });
  }

  async createIncident(security: HealthSecurityContext, input: { tenantId: string; facilityId?: string; type: string; severity: string; title: string; description: string; patientId?: string; location?: string; correctiveAction?: string }) {
    return this.mutate(security, async (session) => {
      const incidentNumber = `INC-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_compliance.incident_reports (tenant_id, facility_id, incident_number, type, severity, title, description, patient_id, location, reported_by, corrective_action) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [input.tenantId, input.facilityId ?? null, incidentNumber, input.type, input.severity, input.title, input.description, input.patientId ?? null, input.location ?? null, security.userId, input.correctiveAction ?? null]);
      return (await session.query(`SELECT * FROM health_compliance.incident_reports WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'incident_report', resourceId: result.id, newState: result }));
  }

  async dashboard(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const complianceScore = await session.query(`SELECT COUNT(*) FILTER (WHERE status='COMPLIANT')::int as compliant, COUNT(*) FILTER (WHERE status='NON_COMPLIANT')::int as non_compliant, COUNT(*) FILTER (WHERE status='PARTIALLY_COMPLIANT')::int as partial, COUNT(*)::int as total FROM health_compliance.compliance_evidence WHERE tenant_id=$1`, [tenantId]);
      const incidents = await session.query(`SELECT type, severity, status, COUNT(*)::int as count FROM health_compliance.incident_reports WHERE tenant_id=$1 GROUP BY type, severity, status`, [tenantId]);
      const auditViolations = await session.query(`SELECT COUNT(*)::int as suspicious_access, COUNT(*) FILTER (WHERE is_break_glass=true)::int as break_glass FROM health_audit.access_logs WHERE tenant_id=$1 AND accessed_at > now() - interval '30 days'`, [tenantId]);
      const overdueEvidence = await session.query(`SELECT COUNT(*)::int as overdue_count FROM health_compliance.compliance_evidence WHERE tenant_id=$1 AND expiry_date < CURRENT_DATE AND status != 'COMPLIANT'`, [tenantId]);
      return { complianceScore: complianceScore.rows[0], incidents: incidents.rows, auditViolations: auditViolations.rows[0], overdue: overdueEvidence.rows[0] };
    });
  }
}
