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
      const tenants = await session.query(`SELECT id, name, type, status FROM health_tenant.tenants WHERE id=$1`, [tenantId]);
      const facilities = await session.query(`SELECT f.id, f.name, f.type, f.code, f.status, f.address, (SELECT json_agg(d) FROM health_tenant.departments d WHERE d.facility_id=f.id) as departments, (SELECT COUNT(*)::int FROM health_tenant.beds b WHERE b.facility_id=f.id) as total_beds, (SELECT COUNT(*)::int FROM health_tenant.beds b WHERE b.facility_id=f.id AND b.status='AVAILABLE') as available_beds FROM health_tenant.facilities f WHERE f.tenant_id=$1 AND f.deleted_at IS NULL`, [tenantId]);
      const workforce = await session.query(`SELECT COUNT(*)::int as total_staff, COUNT(*) FILTER (WHERE employment_status='ACTIVE')::int as active_staff FROM health_workforce.practitioners WHERE tenant_id=$1`, [tenantId]);
      const inventory = await session.query(`SELECT COUNT(*)::int as active_items FROM health_inventory.items WHERE tenant_id=$1 AND status='ACTIVE'`, [tenantId]);
      const equipment = await session.query(`SELECT id, name, model, status, location FROM health_tenant.equipment WHERE facility_id IN (SELECT id FROM health_tenant.facilities WHERE tenant_id=$1) ORDER BY name LIMIT 50`, [tenantId]);
      return { tenant: tenants.rows[0], facilities: facilities.rows, workforce: workforce.rows[0], inventory: inventory.rows[0], equipment: equipment.rows };
    });
  }

  async rooms(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT r.*, d.name as department_name FROM health_tenant.rooms r LEFT JOIN health_tenant.departments d ON d.id=r.department_id WHERE r.facility_id=$1 ORDER BY r.name`, [facilityId]);
      return rows.rows;
    });
  }

  async createRoom(security: HealthSecurityContext, facilityId: string, input: { name: string; roomType: string; departmentId?: string; capacity?: number }) {
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_tenant.rooms (facility_id, department_id, name, room_type, capacity, status) VALUES ($1,$2,$3,$4,$5,'AVAILABLE') RETURNING id`, [facilityId, input.departmentId ?? null, input.name, input.roomType, input.capacity ?? 1]);
      return (await session.query(`SELECT * FROM health_tenant.rooms WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'room', resourceId: result.id, newState: result }));
  }

  async beds(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT b.*, r.name as room_name FROM health_tenant.beds b LEFT JOIN health_tenant.rooms r ON r.id=b.room_id WHERE b.facility_id=$1 ORDER BY b.bed_number`, [facilityId]);
      return rows.rows;
    });
  }

  async equipment(security: HealthSecurityContext, facilityId: string) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_tenant.equipment WHERE facility_id=$1 ORDER BY name`, [facilityId]);
      return rows.rows;
    });
  }

  async createEquipment(security: HealthSecurityContext, facilityId: string, input: { name: string; model?: string; manufacturer?: string; serialNumber?: string; category?: string; location?: string }) {
    return this.mutate(security, async (session) => {
      const res = await session.query<{ id: string }>(`INSERT INTO health_tenant.equipment (facility_id, name, model, manufacturer, serial_number, category, location, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING id`, [facilityId, input.name, input.model ?? null, input.manufacturer ?? null, input.serialNumber ?? null, input.category ?? null, input.location ?? null]);
      return (await session.query(`SELECT * FROM health_tenant.equipment WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'equipment', resourceId: result.id, newState: result }));
  }
}
