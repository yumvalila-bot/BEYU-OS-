import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, conflict } from '../../common/errors';

@Injectable()
export class TenantRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async list(security: AgriSecurityContext, query: { q?: string; limit?: number; offset?: number; status?: string }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['t.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(t.name ILIKE $${params.length} OR t.slug ILIKE $${params.length})`);
    }
    if (query.status) { params.push(query.status); where.push(`t.status = $${params.length}`); }
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) { params.push(security.tenantId); where.push(`t.id = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_tenant.tenants t ${clause}`, params);
      const rows = await session.query(
        `SELECT t.id, t.name, t.slug, t.type, t.status, t.country_code, t.parent_tenant_id, t.created_at, t.updated_at
         FROM agri_tenant.tenants t ${clause} ORDER BY t.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async findById(security: AgriSecurityContext, id: string): Promise<any> {
    return this.read(security, async (session) => {
      const r = await session.query(`SELECT * FROM agri_tenant.tenants WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!r.rows[0]) notFound('tenant', id);
      return r.rows[0];
    });
  }

  async create(security: AgriSecurityContext, input: { name: string; slug: string; type: string; countryCode: string; parentTenantId?: string | null }): Promise<any> {
    if (!input.name || !input.slug || !input.type || !input.countryCode) badRequest('name, slug, type and countryCode are required');
    if (!/^[a-z0-9-]{3,64}$/.test(input.slug)) badRequest('slug must be lowercase alphanumeric with dashes (3-64 chars)');
    return this.mutate(security, async (session) => {
      const dupe = await session.query(`SELECT id FROM agri_tenant.tenants WHERE slug=$1 AND deleted_at IS NULL`, [input.slug]);
      if (dupe.rows[0]) conflict(`tenant slug '${input.slug}' already exists`);
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_tenant.tenants (name, slug, type, status, country_code, parent_tenant_id) VALUES ($1,$2,$3,'PROVISIONING',$4,$5) RETURNING id`,
        [input.name, input.slug, input.type, input.countryCode, input.parentTenantId ?? null],
      );
      const row = await session.query(`SELECT * FROM agri_tenant.tenants WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'tenant', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async update(security: AgriSecurityContext, id: string, patch: Record<string, unknown>): Promise<any> {
    const allowed = ['name', 'type', 'status', 'countryCode'];
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (!keys.length) badRequest('no updatable fields supplied');
    return this.mutate(security, async (session) => {
      const prev = await session.query(`SELECT * FROM agri_tenant.tenants WHERE id=$1 AND deleted_at IS NULL`, [id]);
      if (!prev.rows[0]) notFound('tenant', id);
      const sets = keys.map((k, i) => `${snake(k)}=$${i + 2}`).join(', ');
      await session.query(`UPDATE agri_tenant.tenants SET ${sets}, updated_at=now() WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
      const row = await session.query(`SELECT * FROM agri_tenant.tenants WHERE id=$1`, [id]);
      return { before: prev.rows[0], after: row.rows[0] };
    }, (result) => ({
      action: 'UPDATE', resourceType: 'tenant', resourceId: id,
      previousState: (result as any).before, newState: (result as any).after,
    }));
  }
}

function snake(s: string): string { return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase()); }
