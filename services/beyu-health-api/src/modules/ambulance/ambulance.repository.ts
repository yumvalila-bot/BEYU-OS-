import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound } from '../../common/errors';

@Injectable()
export class AmbulanceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async listVehicles(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT a.*, f.name as base_facility_name FROM health_ambulance.ambulances a LEFT JOIN health_tenant.facilities f ON f.id=a.base_facility_id WHERE a.tenant_id=$1 ORDER BY a.vehicle_number`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }

  async requests(security: HealthSecurityContext, query: { status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.status) add('r.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('r.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_ambulance.emergency_requests r ${clause}`, params);
      const rows = await session.query(`SELECT r.* FROM health_ambulance.emergency_requests r ${clause} ORDER BY r.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createRequest(security: HealthSecurityContext, input: { callerName: string; callerPhone: string; incidentType: string; priority: string; pickupAddress?: string; pickupLat?: number; pickupLng?: number; destinationFacilityId?: string; }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const requestNumber = `ER-${Date.now()}-${Math.random().toString(36).slice(2,4).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ambulance.emergency_requests (tenant_id, request_number, caller_name, caller_phone, incident_type, priority, pickup_address, pickup_lat, pickup_lng, destination_facility_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, requestNumber, input.callerName, input.callerPhone, input.incidentType, input.priority, input.pickupAddress ?? null, input.pickupLat ?? null, input.pickupLng ?? null, input.destinationFacilityId ?? null, security.userId]);
      return (await session.query(`SELECT * FROM health_ambulance.emergency_requests WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'emergency_request', resourceId: (result as any).id, newState: result as any }));
  }

  async dispatch(security: HealthSecurityContext, requestId: string, ambulanceId: string) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const dispatchNumber = `DISP-${Date.now()}-${Math.random().toString(36).slice(2,4).toUpperCase()}`;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ambulance.dispatches (tenant_id, ambulance_id, request_id, dispatch_number, dispatched_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [tenantId, ambulanceId, requestId, dispatchNumber, security.userId]);
      await session.query(`UPDATE health_ambulance.ambulances SET status='DISPATCHED', updated_at=now() WHERE id=$1`, [ambulanceId]);
      await session.query(`UPDATE health_ambulance.emergency_requests SET status='DISPATCHED', updated_at=now() WHERE id=$1`, [requestId]);
      return (await session.query(`SELECT * FROM health_ambulance.dispatches WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'dispatch', resourceId: (result as any).id, newState: result as any }));
  }

  async updateLocation(security: HealthSecurityContext, ambulanceId: string, lat: number, lng: number) {
    return this.mutate(security, async (session) => {
      await session.query(`UPDATE health_ambulance.ambulances SET last_latitude=$1, last_longitude=$2, last_location_at=now(), updated_at=now() WHERE id=$3`, [lat, lng, ambulanceId]);
      return { ambulanceId, lat, lng, updatedAt: new Date().toISOString() };
    }, (result) => ({ action: 'UPDATE', resourceType: 'ambulance', resourceId: ambulanceId, newState: result as any }));
  }
}
