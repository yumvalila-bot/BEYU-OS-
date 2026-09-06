import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database, DatabaseSession } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden } from '../../common/errors';

@Injectable()
export class FarmRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext): string {
    const tenantId = security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId!;
  }

  async list(security: AgriSecurityContext, query: { q?: string; limit?: number; offset?: number; status?: string; farmType?: string }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['f.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`f.tenant_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(f.name ILIKE $${params.length} OR f.code ILIKE $${params.length})`); }
    if (query.status) { params.push(query.status); where.push(`f.status = $${params.length}`); }
    if (query.farmType) { params.push(query.farmType); where.push(`f.farm_type = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_farm.farms f ${clause}`, params);
      const rows = await session.query(
        `SELECT f.id, f.tenant_id, f.code, f.name, f.farm_type, f.status, f.country_code, f.region, f.district, f.village, f.gps_latitude, f.gps_longitude, f.total_area_ha, f.tenure, f.created_at, f.updated_at
         FROM agri_farm.farms f ${clause} ORDER BY f.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async findById(security: AgriSecurityContext, id: string): Promise<any> {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT * FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!r.rows[0]) notFound('farm', id);
      this.assertRowVisible(security, r.rows[0], 'farm', id);
      return r.rows[0];
    });
  }

  async create(security: AgriSecurityContext, input: { tenantId: string; name: string; farmType: string; countryCode: string; region?: string | null; district?: string | null; village?: string | null; gpsLatitude?: number | null; gpsLongitude?: number | null; totalAreaHa?: number | null; tenure?: string | null }): Promise<any> {
    const tenantId = input.tenantId ?? this.tenantOf(security);
    if (!tenantId) badRequest('tenantId required');
    if (!input.name || !input.farmType || !input.countryCode) badRequest('name, farmType and countryCode are required');
    if (input.totalAreaHa != null && input.totalAreaHa <= 0) badRequest('totalAreaHa must be positive');
    return this.mutate(security, async (session) => {
      await assertTenantExists(session, tenantId);
      const codeRes = await session.query<{ code: string }>(`SELECT agri_farm.generate_farm_code($1) AS code`, [tenantId]);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_farm.farms (tenant_id, code, name, farm_type, status, country_code, region, district, village, gps_latitude, gps_longitude, total_area_ha, tenure, created_by)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [tenantId, codeRes.rows[0].code, input.name, input.farmType, input.countryCode, input.region ?? null, input.district ?? null, input.village ?? null, input.gpsLatitude ?? null, input.gpsLongitude ?? null, input.totalAreaHa ?? null, input.tenure ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_farm.farms WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'farm', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async update(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const allowed = ['name', 'farmType', 'status', 'region', 'district', 'village', 'gpsLatitude', 'gpsLongitude', 'totalAreaHa', 'tenure'];
    const camelToSnake: Record<string, string> = { farmType: 'farm_type', gpsLatitude: 'gps_latitude', gpsLongitude: 'gps_longitude', totalAreaHa: 'total_area_ha' };
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    const assignments = keys.map((k, i) => `${camelToSnake[k] ?? k}=$${i + 2}`);
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('farm', id);
      this.assertRowVisible(security, prev.rows[0], 'farm', id);
      await session.query(`UPDATE agri_farm.farms SET ${assignments.join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_farm.farms WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'farm', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  async softDelete(security: AgriSecurityContext, id: string): Promise<void> {
    await this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('farm', id);
      this.assertRowVisible(security, prev.rows[0], 'farm', id);
      await session.query(`UPDATE agri_farm.farms SET deleted_at=now(), status='CLOSED' WHERE id=$1`, [id]);
      return prev.rows[0];
    }, (prev) => ({
      action: 'DELETE', resourceType: 'farm', resourceId: id, previousState: prev as any,
    }));
  }
}

export async function assertTenantExists(session: DatabaseSession, tenantId: string): Promise<void> {
  const r = await session.query(`SELECT id FROM agri_tenant.tenants WHERE id=$1 AND deleted_at IS NULL`, [tenantId]);
  if (!r.rows[0]) badRequest(`tenant ${tenantId} does not exist`);
}
