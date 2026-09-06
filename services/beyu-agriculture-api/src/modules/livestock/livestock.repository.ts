import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/** Herds, animals, health events, production records. */
@Injectable()
export class LivestockRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  // ── Herds ─────────────────────────────────────────────────────────────

  async listHerds(security: AgriSecurityContext, query: { farmId?: string; species?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['h.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`h.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`h.farm_id = $${params.length}`); }
    if (query.species) { params.push(query.species); where.push(`h.species = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_livestock.herds h ${clause}`, params);
      const rows = await session.query(
        `SELECT h.*, f.name AS farm_name,
           (SELECT count(*) FROM agri_livestock.animals a WHERE a.herd_id=h.id AND a.status='ACTIVE') AS active_animals
         FROM agri_livestock.herds h JOIN agri_farm.farms f ON f.id=h.farm_id ${clause}
         ORDER BY h.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createHerd(security: AgriSecurityContext, input: { farmId: string; name: string; species: string; code?: string; notes?: string | null }): Promise<any> {
    if (!input.farmId || !input.name || !input.species) badRequest('farmId, name and species are required');
    return this.mutate(security, async (session) => {
      const farm = await session.query<any>(`SELECT id, tenant_id FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
      if (!farm.rows[0]) notFound('farm', input.farmId);
      const tenantId = farm.rows[0].tenant_id;
      const code = input.code ?? `HRD-${String(Date.now()).slice(-8)}`;
      const dupe = await session.query(`SELECT id FROM agri_livestock.herds WHERE tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, [tenantId, code]);
      if (dupe.rows[0]) conflict('herd code already exists in tenant');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_livestock.herds (tenant_id, farm_id, code, name, species, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, input.farmId, code, input.name, input.species, input.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_livestock.herds WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'herd', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Animals ───────────────────────────────────────────────────────────

  async listAnimals(security: AgriSecurityContext, query: { herdId?: string; species?: string; status?: string; q?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['a.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`a.tenant_id = $${params.length}`); }
    if (query.herdId) { params.push(query.herdId); where.push(`a.herd_id = $${params.length}`); }
    if (query.species) { params.push(query.species); where.push(`a.species = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`a.status = $${params.length}`); }
    if (query.q) { params.push(`%${query.q}%`); where.push(`a.tag_number ILIKE $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_livestock.animals a ${clause}`, params);
      const rows = await session.query(`SELECT a.* FROM agri_livestock.animals a ${clause} ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createAnimal(security: AgriSecurityContext, input: { tenantId?: string; herdId?: string | null; tagNumber: string; species: string; breed?: string | null; sex: string; dateOfBirth?: string | null; acquisitionDate?: string | null; notes?: string | null }): Promise<any> {
    if (!input.tagNumber || !input.species || !input.sex) badRequest('tagNumber, species and sex are required');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.herdId) {
        const herd = await session.query<any>(`SELECT id, tenant_id FROM agri_livestock.herds WHERE id=$1 AND deleted_at IS NULL`, [input.herdId]);
        if (!herd.rows[0]) notFound('herd', input.herdId);
        tenantId = herd.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('herdId or tenant membership required');
      const dupe = await session.query(`SELECT id FROM agri_livestock.animals WHERE tenant_id=$1 AND tag_number=$2 AND deleted_at IS NULL`, [tenantId, input.tagNumber]);
      if (dupe.rows[0]) conflict(`tag number ${input.tagNumber} already exists in tenant`);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_livestock.animals (tenant_id, herd_id, tag_number, species, breed, sex, date_of_birth, status, acquisition_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9) RETURNING id`,
        [tenantId, input.herdId ?? null, input.tagNumber, input.species, input.breed ?? null, input.sex, input.dateOfBirth ?? null, input.acquisitionDate ?? null, input.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_livestock.animals WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'animal', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async updateAnimal(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const camelToSnake: Record<string, string> = { tagNumber: 'tag_number', dateOfBirth: 'date_of_birth', acquisitionDate: 'acquisition_date', herdId: 'herd_id' };
    const allowed = Object.keys(camelToSnake).concat(['breed', 'status', 'notes']);
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    const assignments = keys.map((k, i) => `${camelToSnake[k] ?? k}=$${i + 2}`);
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_livestock.animals WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('animal', id);
      this.assertRowVisible(security, prev.rows[0], 'animal', id);
      await session.query(`UPDATE agri_livestock.animals SET ${assignments.join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_livestock.animals WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'animal', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }

  // ── Health events ─────────────────────────────────────────────────────

  async listHealthEvents(security: AgriSecurityContext, query: { animalId?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`e.tenant_id = $${params.length}`); }
    if (query.animalId) { params.push(query.animalId); where.push(`e.animal_id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_livestock.animal_health_events e ${clause}`, params);
      const rows = await session.query(`SELECT e.* FROM agri_livestock.animal_health_events e ${clause} ORDER BY e.event_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createHealthEvent(security: AgriSecurityContext, input: { animalId: string; eventType: string; eventDate: string; veterinarian?: string | null; treatment?: string | null; withdrawalDays?: number | null; costAmount?: number | null; costCurrency?: string | null; notes?: string | null }): Promise<any> {
    if (!input.animalId || !input.eventType || !input.eventDate) badRequest('animalId, eventType and eventDate are required');
    return this.mutate(security, async (session) => {
      const animal = await session.query<any>(`SELECT id, tenant_id, status FROM agri_livestock.animals WHERE id=$1 AND deleted_at IS NULL`, [input.animalId]);
      if (!animal.rows[0]) notFound('animal', input.animalId);
      this.assertRowVisible(security, animal.rows[0], 'animal', input.animalId);
      if (animal.rows[0].status !== 'ACTIVE') badRequest('cannot add health events to a non-active animal');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_livestock.animal_health_events (tenant_id, animal_id, event_type, event_date, veterinarian, treatment, withdrawal_days, cost_amount, cost_currency, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [animal.rows[0].tenant_id, input.animalId, input.eventType, input.eventDate, input.veterinarian ?? null, input.treatment ?? null, input.withdrawalDays ?? null, input.costAmount ?? null, input.costCurrency ?? null, input.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_livestock.animal_health_events WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'animal_health_event', resourceId: (result as any).id, newState: result as any,
    }));
  }

  // ── Production records ────────────────────────────────────────────────

  async listProduction(security: AgriSecurityContext, query: { herdId?: string; productionType?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`pr.tenant_id = $${params.length}`); }
    if (query.herdId) { params.push(query.herdId); where.push(`pr.herd_id = $${params.length}`); }
    if (query.productionType) { params.push(query.productionType); where.push(`pr.production_type = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_livestock.production_records pr ${clause}`, params);
      const rows = await session.query(`SELECT pr.* FROM agri_livestock.production_records pr ${clause} ORDER BY pr.recorded_on DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createProduction(security: AgriSecurityContext, input: { tenantId?: string; herdId?: string | null; animalId?: string | null; productionType: string; recordedOn: string; quantity: number; unit: string; notes?: string | null }): Promise<any> {
    if (!input.productionType || !input.recordedOn || !input.unit) badRequest('productionType, recordedOn and unit are required');
    if (input.quantity == null || input.quantity < 0) badRequest('quantity cannot be negative');
    return this.mutate(security, async (session) => {
      let tenantId = this.tenantOf(security, input.tenantId);
      if (input.herdId) {
        const herd = await session.query<any>(`SELECT tenant_id FROM agri_livestock.herds WHERE id=$1 AND deleted_at IS NULL`, [input.herdId]);
        if (!herd.rows[0]) notFound('herd', input.herdId);
        tenantId = herd.rows[0].tenant_id;
      } else if (input.animalId) {
        const animal = await session.query<any>(`SELECT tenant_id FROM agri_livestock.animals WHERE id=$1 AND deleted_at IS NULL`, [input.animalId]);
        if (!animal.rows[0]) notFound('animal', input.animalId);
        tenantId = animal.rows[0].tenant_id;
      }
      if (!tenantId) badRequest('herdId or animalId or tenant membership required');
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_livestock.production_records (tenant_id, herd_id, animal_id, production_type, recorded_on, quantity, unit, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, input.herdId ?? null, input.animalId ?? null, input.productionType, input.recordedOn, input.quantity, input.unit, input.notes ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_livestock.production_records WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'production_record', resourceId: (result as any).id, newState: result as any,
    }));
  }
}
