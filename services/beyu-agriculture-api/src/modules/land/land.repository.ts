import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden } from '../../common/errors';

/** Fields (parcels), soil records and weather observations. */
@Injectable()
export class LandRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Fields ────────────────────────────────────────────────────────────

  async listFields(security: AgriSecurityContext, query: { q?: string; farmId?: string; limit?: number; offset?: number; status?: string }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['fl.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`fl.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`fl.farm_id = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`(fl.name ILIKE $${params.length} OR fl.code ILIKE $${params.length})`); }
    if (query.status) { params.push(query.status); where.push(`fl.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_farm.fields fl ${clause}`, params);
      const rows = await session.query(
        `SELECT fl.id, fl.tenant_id, fl.farm_id, fl.code, fl.name, fl.field_use, fl.area_ha, fl.soil_texture, fl.irrigation_type, fl.status, fl.created_at, fl.updated_at,
                f.name AS farm_name
         FROM agri_farm.fields fl JOIN agri_farm.farms f ON f.id = fl.farm_id ${clause}
         ORDER BY fl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async findFieldById(security: AgriSecurityContext, id: string): Promise<any> {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT fl.*, f.name AS farm_name FROM agri_farm.fields fl JOIN agri_farm.farms f ON f.id=fl.farm_id WHERE fl.id=$1 AND fl.deleted_at IS NULL`, [id]);
      if (!r.rows[0]) notFound('field', id);
      this.assertRowVisible(security, r.rows[0], 'field', id);
      return r.rows[0];
    });
  }

  async createField(security: AgriSecurityContext, input: { tenantId?: string; farmId: string; name: string; fieldUse: string; areaHa: number; soilTexture?: string | null; irrigationType?: string | null; boundary?: unknown | null }): Promise<any> {
    if (!input.farmId || !input.name || !input.fieldUse) badRequest('farmId, name and fieldUse are required');
    if (input.areaHa == null || input.areaHa <= 0) badRequest('areaHa must be positive');
    let boundaryJson: string | null = null;
    if (input.boundary != null) {
      try { boundaryJson = JSON.stringify(input.boundary); } catch { badRequest('boundary must be JSON-serializable GeoJSON'); }
    }
    return this.mutate(security, async (session) => {
      const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
      if (!farm.rows[0]) notFound('farm', input.farmId);
      // Tenant is always derived server-side from the parent farm — never
      // client input — so a field can never land in another tenant.
      const useTenant = farm.rows[0].tenant_id;
      const myTenant = input.tenantId ?? security.activeTenantId ?? security.tenantId;
      if (myTenant && useTenant !== myTenant && !security.roles.includes('SUPER_ADMIN')) {
        notFound('farm', input.farmId);
      }
      const codeRes = await session.query<{ code: string }>(`SELECT agri_farm.generate_field_code($1) AS code`, [input.farmId]);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_farm.fields (tenant_id, farm_id, code, name, field_use, area_ha, soil_texture, irrigation_type, boundary, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE') RETURNING id`,
        [useTenant, input.farmId, codeRes.rows[0].code, input.name, input.fieldUse, input.areaHa, input.soilTexture ?? null, input.irrigationType ?? null, boundaryJson],
      );
      const row = await session.query(`SELECT * FROM agri_farm.fields WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'field', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async updateField(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const camelToSnake: Record<string, string> = { fieldUse: 'field_use', areaHa: 'area_ha', soilTexture: 'soil_texture', irrigationType: 'irrigation_type' };
    const allowed = Object.keys(camelToSnake).concat(['name', 'status']);
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    const assignments = keys.map((k, i) => `${camelToSnake[k] ?? k}=$${i + 2}`);
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('field', id);
      this.assertRowVisible(security, prev.rows[0], 'field', id);
      await session.query(`UPDATE agri_farm.fields SET ${assignments.join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_farm.fields WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'field', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  async deleteField(security: AgriSecurityContext, id: string): Promise<void> {
    await this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('field', id);
      this.assertRowVisible(security, prev.rows[0], 'field', id);
      const active = await session.query(`SELECT id FROM agri_crop.crop_cycles WHERE field_id=$1 AND status IN ('PLANNED','PLANTED','GROWING')`, [id]);
      if (active.rows[0]) badRequest('field has active crop cycles; terminate them first');
      await session.query(`UPDATE agri_farm.fields SET deleted_at=now(), status='RETIRED' WHERE id=$1`, [id]);
      return prev.rows[0];
    }, (prev) => ({
      action: 'DELETE', resourceType: 'field', resourceId: id, previousState: prev as any,
    }));
  }

  // ── Soil records ──────────────────────────────────────────────────────

  async listSoilRecords(security: AgriSecurityContext, query: { fieldId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`sr.tenant_id = $${params.length}`); }
    if (query.fieldId) { params.push(query.fieldId); where.push(`sr.field_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_farm.soil_records sr ${clause}`, params);
      const rows = await session.query(`SELECT sr.* FROM agri_farm.soil_records sr ${clause} ORDER BY sr.sampled_on DESC, sr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createSoilRecord(security: AgriSecurityContext, input: { tenantId?: string; fieldId: string; sampledOn: string; ph?: number | null; organicMatterPct?: number | null; nitrogenPPM?: number | null; phosphorusPPM?: number | null; potassiumPPM?: number | null; notes?: string | null }): Promise<any> {
    if (!input.fieldId || !input.sampledOn) badRequest('fieldId and sampledOn are required');
    if (input.ph != null && (input.ph < 0 || input.ph > 14)) badRequest('ph must be between 0 and 14');
    return this.mutate(security, async (session) => {
      const field = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.fields WHERE id=$1 AND deleted_at IS NULL`, [input.fieldId]);
      if (!field.rows[0]) notFound('field', input.fieldId);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_farm.soil_records (tenant_id, field_id, sampled_on, ph, organic_matter_pct, nitrogen_ppm, phosphorus_ppm, potassium_ppm, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [field.rows[0].tenant_id, input.fieldId, input.sampledOn, input.ph ?? null, input.organicMatterPct ?? null, input.nitrogenPPM ?? null, input.phosphorusPPM ?? null, input.potassiumPPM ?? null, input.notes ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_farm.soil_records WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'soil_record', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Weather observations ──────────────────────────────────────────────

  async listWeather(security: AgriSecurityContext, query: { farmId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`w.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`w.farm_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_farm.weather_observations w ${clause}`, params);
      const rows = await session.query(`SELECT w.* FROM agri_farm.weather_observations w ${clause} ORDER BY w.observed_on DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createWeather(security: AgriSecurityContext, input: { tenantId?: string; farmId: string; observedOn: string; temperatureC?: number | null; rainfallMm?: number | null; humidityPct?: number | null; windKph?: number | null; notes?: string | null }): Promise<any> {
    if (!input.farmId || !input.observedOn) badRequest('farmId and observedOn are required');
    if (input.rainfallMm != null && input.rainfallMm < 0) badRequest('rainfallMm cannot be negative');
    return this.mutate(security, async (session) => {
      const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
      if (!farm.rows[0]) notFound('farm', input.farmId);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_farm.weather_observations (tenant_id, farm_id, observed_on, temperature_c, rainfall_mm, humidity_pct, wind_kph, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [farm.rows[0].tenant_id, input.farmId, input.observedOn, input.temperatureC ?? null, input.rainfallMm ?? null, input.humidityPct ?? null, input.windKph ?? null, input.notes ?? null, security.userId],
      );
      const row = await session.query(`SELECT * FROM agri_farm.weather_observations WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'weather_observation', resourceId: (result as any).id, newState: result as any,
    }));
  }
}
