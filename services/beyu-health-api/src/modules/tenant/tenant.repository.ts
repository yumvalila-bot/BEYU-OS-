import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound, badRequest } from '../../common/errors';

@Injectable()
export class TenantRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async list(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const where = security.roles.includes('SUPER_ADMIN') ? '' : 'WHERE t.id = $1';
      const params = security.roles.includes('SUPER_ADMIN') ? [] : [security.tenantId];
      const rows = await session.query(`SELECT t.id, t.name, t.slug, t.type, t.status, t.country_code, t.created_at, t.data_residency FROM health_tenant.tenants t ${where} ORDER BY t.name`, params);
      return rows.rows;
    });
  }

  async findById(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT t.*, (SELECT json_agg(f) FROM health_tenant.facilities f WHERE f.tenant_id=t.id AND f.deleted_at IS NULL) as facilities FROM health_tenant.tenants t WHERE t.id=$1`, [id]);
      if (!r.rows[0]) notFound('tenant', id);
      return r.rows[0];
    });
  }

  async facilities(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT f.id, f.name, f.type, f.code, f.status, f.address, f.contact_phone, f.contact_email, (SELECT COUNT(*)::int FROM health_tenant.departments d WHERE d.facility_id=f.id) as department_count, (SELECT COUNT(*)::int FROM health_tenant.beds b WHERE b.facility_id=f.id) as bed_count FROM health_tenant.facilities f WHERE f.tenant_id=$1 AND f.deleted_at IS NULL ORDER BY f.name`, [tenantId]);
      return rows.rows;
    });
  }

  async create(security: HealthSecurityContext, input: { name: string; slug: string; type: string; countryCode?: string; parentTenantId?: string; settings?: any }) {
    if (!input.name || !input.slug) badRequest('name and slug required');
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_tenant.tenants (name, slug, type, country_code, parent_tenant_id, settings, status) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`, [input.name, input.slug, input.type, input.countryCode ?? 'TZ', input.parentTenantId ?? null, JSON.stringify(input.settings ?? {})]);
      return (await session.query(`SELECT * FROM health_tenant.tenants WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'tenant', resourceId: result.id, newState: result }));
  }

  async createFacility(security: HealthSecurityContext, tenantId: string, input: { name: string; type: string; code: string; address?: string; phone?: string; email?: string }) {
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_tenant.facilities (tenant_id, name, type, code, address, contact_phone, contact_email, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`, [tenantId, input.name, input.type, input.code, input.address ?? null, input.phone ?? null, input.email ?? null]);
      return (await session.query(`SELECT * FROM health_tenant.facilities WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'facility', resourceId: result.id, newState: result }));
  }

  async departments(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT d.*, (SELECT COUNT(*)::int FROM health_tenant.rooms r WHERE r.department_id=d.id) as room_count FROM health_tenant.departments d WHERE d.facility_id=$1 ORDER BY d.name`, [facilityId]);
      return rows.rows;
    });
  }

  async createDepartment(security: HealthSecurityContext, facilityId: string, input: { name: string; code: string; specialty?: string }) {
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_tenant.departments (facility_id, name, code, specialty, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING id`, [facilityId, input.name, input.code, input.specialty ?? null]);
      return (await session.query(`SELECT * FROM health_tenant.departments WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'department', resourceId: result.id, newState: result }));
  }

  async stats(security: HealthSecurityContext, tenantId: string) {
    return this.read(security, async (session) => {
      const [facilities, patients, encounters, staff, beds] = await Promise.all([
        session.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM health_tenant.facilities WHERE tenant_id=$1 AND deleted_at IS NULL`, [tenantId]),
        session.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM health_patient.patients WHERE tenant_id=$1 AND deleted_at IS NULL`, [tenantId]),
        session.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM health_clinical.encounters WHERE tenant_id=$1`, [tenantId]),
        session.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM health_workforce.practitioners WHERE tenant_id=$1`, [tenantId]),
        session.query(`SELECT status, COUNT(*)::int as count FROM health_tenant.beds WHERE facility_id IN (SELECT id FROM health_tenant.facilities WHERE tenant_id=$1) GROUP BY status`, [tenantId]),
      ]);
      return {
        facilityCount: Number(facilities.rows[0].count),
        patientCount: Number(patients.rows[0].count),
        encounterCount: Number(encounters.rows[0].count),
        staffCount: Number(staff.rows[0].count),
        bedStats: beds.rows,
      };
    });
  }
}
