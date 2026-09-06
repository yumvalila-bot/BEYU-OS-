import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { forbidden } from '../../common/errors';

/** Tenant-scoped operational analytics. */
@Injectable()
export class ReportingRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async tenantStats(security: AgriSecurityContext): Promise<any> {
    const tenantId = security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return this.read(security, async (session) => {
      const p = (extra: unknown[] = []) => (tenantId ? [tenantId, ...extra] : extra);
      const tn = tenantId ? `tenant_id = $1` : `1=1`;
      const farms = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM agri_farm.farms WHERE ${tn} AND deleted_at IS NULL`, p());
      const fields = await session.query<{ count: string; area: string | null }>(
        `SELECT count(*)::text AS count, COALESCE(SUM(area_ha),0)::text AS area FROM agri_farm.fields WHERE ${tn} AND deleted_at IS NULL`, p());
      const cycles = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM agri_crop.crop_cycles WHERE ${tn} AND status IN ('PLANNED','PLANTED','GROWING') AND deleted_at IS NULL`, p());
      const livestock = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM agri_livestock.animals WHERE ${tn} AND status='ACTIVE' AND deleted_at IS NULL`, p());
      const workOrders = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM agri_workforce.work_orders WHERE ${tn} AND status IN ('DRAFT','ASSIGNED','IN_PROGRESS') AND deleted_at IS NULL`, p());
      const storage = await session.query<{ kg: string }>(
        `SELECT COALESCE(SUM(quantity_kg - quantity_released_kg),0)::text AS kg FROM agri_crop.storage_lots WHERE ${tn} AND status='IN_STORAGE'`, p());
      const harvestYtd = await session.query<{ kg: string }>(
        `SELECT COALESCE(SUM(h.quantity_kg),0)::text AS kg FROM agri_crop.harvests h WHERE ${tn} AND h.deleted_at IS NULL AND h.harvested_on >= date_trunc('year', now())`, p());
      return {
        tenantId,
        farms: Number(farms.rows[0].count),
        fields: Number(fields.rows[0].count),
        fieldAreaHa: Number(fields.rows[0].area ?? 0),
        activeCropCycles: Number(cycles.rows[0].count),
        livestock: Number(livestock.rows[0].count),
        openWorkOrders: Number(workOrders.rows[0].count),
        storageKg: Number(storage.rows[0].kg),
        harvestYtdKg: Number(harvestYtd.rows[0].kg),
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
