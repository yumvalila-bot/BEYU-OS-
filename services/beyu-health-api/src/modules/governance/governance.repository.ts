import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class GovernanceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async policies(security: HealthSecurityContext, category?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE (p.tenant_id=$1 OR p.tenant_id IS NULL)`;
      if (category) { params.push(category); where += ` AND p.category=$${params.length}`; }
      const rows = await session.query(`SELECT p.*, u.display_name as creator_name FROM health_governance.policies p LEFT JOIN health_identity.users u ON u.id=p.created_by ${where} ORDER BY p.category, p.name`, params);
      return rows.rows;
    });
  }

  async createPolicy(security: HealthSecurityContext, input: { code: string; name: string; description?: string; category: string; content: string; effectiveFrom?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_governance.policies (tenant_id, code, name, description, category, content, version, status, created_by, effective_from) VALUES ($1,$2,$3,$4,$5,$6,1,'DRAFT',$7,$8) RETURNING id`, [tenantId, input.code, input.name, input.description ?? null, input.category, input.content, security.userId, input.effectiveFrom ?? null]);
      return (await session.query(`SELECT * FROM health_governance.policies WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'policy', resourceId: result.id, newState: result }));
  }

  async approvals(security: HealthSecurityContext, query?: { status?: string; resourceType?: string }) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE ar.tenant_id=$1`;
      if (query?.status) { params.push(query.status); where += ` AND ar.status=$${params.length}`; }
      if (query?.resourceType) { params.push(query.resourceType); where += ` AND ar.resource_type=$${params.length}`; }
      const rows = await session.query(`SELECT ar.*, w.name as workflow_name, u.display_name as requester_name FROM health_governance.approval_requests ar JOIN health_governance.approval_workflows w ON w.id=ar.workflow_id JOIN health_identity.users u ON u.id=ar.requested_by ${where} ORDER BY ar.created_at DESC LIMIT 100`, params);
      return rows.rows;
    });
  }

  async createApproval(security: HealthSecurityContext, input: { workflowId: string; resourceType: string; resourceId: string; reason: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_governance.approval_requests (tenant_id, workflow_id, resource_type, resource_id, requested_by, reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [tenantId, input.workflowId, input.resourceType, input.resourceId, security.userId, input.reason]);
      return (await session.query(`SELECT * FROM health_governance.approval_requests WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'approval_request', resourceId: result.id, newState: result }));
  }

  async decideApproval(security: HealthSecurityContext, id: string, decision: 'APPROVED' | 'REJECTED', notes?: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_governance.approval_requests WHERE id=$1`, [id]);
      if (!existing.rows[0]) notFound('approval_request', id);
      const res = await session.query(`UPDATE health_governance.approval_requests SET status=$1, decision_notes=$2, decided_by=$3, decided_at=now() WHERE id=$4 RETURNING *`, [decision, notes ?? null, security.userId, id]);
      return res.rows[0];
    }, (result: any) => ({ action: result.status === 'APPROVED' ? 'APPROVE' : 'REJECT', resourceType: 'approval_request', resourceId: id, newState: result }));
  }

  async workflows(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_governance.approval_workflows WHERE tenant_id=$1 ORDER BY name`, [security.activeTenantId ?? security.tenantId]);
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
