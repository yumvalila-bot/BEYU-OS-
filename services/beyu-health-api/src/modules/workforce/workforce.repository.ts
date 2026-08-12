import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class WorkforceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async list(security: HealthSecurityContext, query: { q?: string; facilityId?: string; specialty?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.q) { params.push(`%${query.q}%`); where.push(`(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.specialty ILIKE $${params.length})`); }
    if (query.facilityId) add('p.primary_facility_id = ?', query.facilityId);
    if (query.specialty) add('p.specialty = ?', query.specialty);
    if (query.status) add('p.employment_status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('p.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_workforce.practitioners p ${clause}`, params);
      const rows = await session.query(`SELECT p.*, f.name as facility_name FROM health_workforce.practitioners p LEFT JOIN health_tenant.facilities f ON f.id=p.primary_facility_id ${clause} ORDER BY p.last_name, p.first_name LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async getById(security: HealthSecurityContext, id: string) {
    return this.read(security, async (session) => {
      const p = await session.query(`SELECT p.*, f.name as facility_name FROM health_workforce.practitioners p LEFT JOIN health_tenant.facilities f ON f.id=p.primary_facility_id WHERE p.id=$1`, [id]);
      if (!p.rows[0]) notFound('practitioner', id);
      const [roles, credentials, shifts] = await Promise.all([
        session.query(`SELECT pr.*, f.name as facility_name FROM health_workforce.practitioner_roles pr JOIN health_tenant.facilities f ON f.id=pr.facility_id WHERE pr.practitioner_id=$1`, [id]),
        session.query(`SELECT * FROM health_workforce.credentials WHERE practitioner_id=$1 ORDER BY issue_date DESC`, [id]),
        session.query(`SELECT * FROM health_workforce.shifts WHERE practitioner_id=$1 ORDER BY start DESC LIMIT 20`, [id]),
      ]);
      return { ...p.rows[0], roles: roles.rows, credentials: credentials.rows, shifts: shifts.rows };
    });
  }

  async create(security: HealthSecurityContext, input: { code: string; firstName: string; lastName: string; specialty?: string; qualification?: string; licenseNumber?: string; phone?: string; email?: string; primaryFacilityId?: string; employmentType?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_workforce.practitioners (tenant_id, code, first_name, last_name, specialty, qualification, license_number, phone, email, primary_facility_id, employment_type, employment_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE') RETURNING id`, [tenantId, input.code, input.firstName, input.lastName, input.specialty ?? null, input.qualification ?? null, input.licenseNumber ?? null, input.phone ?? null, input.email ?? null, input.primaryFacilityId ?? null, input.employmentType ?? 'FULL_TIME']);
      return (await session.query(`SELECT * FROM health_workforce.practitioners WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'practitioner', resourceId: result.id, newState: result }));
  }

  async shifts(security: HealthSecurityContext, practitionerId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT s.*, f.name as facility_name FROM health_workforce.shifts s JOIN health_tenant.facilities f ON f.id=s.facility_id WHERE s.practitioner_id=$1 ORDER BY s.start DESC LIMIT 50`, [practitionerId]);
      return rows.rows;
    });
  }

  async createShift(security: HealthSecurityContext, input: { practitionerId: string; facilityId: string; departmentId?: string; start: string; end: string; type: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const shiftNumber = `SHIFT-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_workforce.shifts (tenant_id, practitioner_id, facility_id, department_id, shift_number, start, "end", type, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SCHEDULED') RETURNING id`, [tenantId, input.practitionerId, input.facilityId, input.departmentId ?? null, shiftNumber, input.start, input.end, input.type]);
      return (await session.query(`SELECT * FROM health_workforce.shifts WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'shift', resourceId: result.id, newState: result }));
  }

  async attendance(security: HealthSecurityContext, practitionerId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_workforce.attendance WHERE practitioner_id=$1 ORDER BY check_in DESC LIMIT 50`, [practitionerId]);
      return rows.rows;
    });
  }

  async checkIn(security: HealthSecurityContext, practitionerId: string, input: { method?: string; lat?: number; lng?: number }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_workforce.attendance (tenant_id, practitioner_id, check_in, check_in_method, location_lat, location_lng, status) VALUES ($1,$2,now(),$3,$4,$5,'PRESENT') RETURNING id`, [tenantId, practitionerId, input.method ?? 'MANUAL', input.lat ?? null, input.lng ?? null]);
      return (await session.query(`SELECT * FROM health_workforce.attendance WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'attendance', resourceId: result.id, newState: result }));
  }
}
