import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class IntegrationRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async configs(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_integration.integration_configs WHERE tenant_id=$1 ORDER BY name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }

  async fhirSearch(security: HealthSecurityContext, resourceType: string, patientId?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE fhir.tenant_id=$1 AND fhir.resource_type=$2`;
      params.push(resourceType);
      if (patientId) { params.push(patientId); where += ` AND fhir.patient_id=$${params.length}`; }
      const rows = await session.query(`SELECT fhir.* FROM health_integration.fhir_resources fhir ${where} ORDER BY fhir.updated_at DESC LIMIT 100`, params);
      return { resourceType, count: rows.rows.length, data: rows.rows.map(r => r.data) };
    });
  }

  async createFhir(security: HealthSecurityContext, input: { fhirId: string; resourceType: string; data: any; patientId?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_integration.fhir_resources (tenant_id, fhir_id, resource_type, data, patient_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, resource_type, fhir_id) DO UPDATE SET data=$4, updated_at=now() RETURNING id`,
        [tenantId, input.fhirId, input.resourceType, JSON.stringify(input.data), input.patientId ?? null]);
      return (await session.query(`SELECT * FROM health_integration.fhir_resources WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'fhir_resource', resourceId: (result as any).id, newState: result as any }));
  }

  async featureFlags(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_integration.feature_flags WHERE (tenant_id IS NULL OR tenant_id=$1) ORDER BY key`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }

  async eventOutbox(security: HealthSecurityContext, limit = 20) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_integration.event_outbox WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`, [security.activeTenantId ?? security.tenantId, limit]);
      return rows.rows;
    });
  }
}
