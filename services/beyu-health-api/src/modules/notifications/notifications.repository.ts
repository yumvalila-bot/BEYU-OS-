import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class NotificationsRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }
  async list(security: HealthSecurityContext, query: { recipientId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = resolveLimit(query.limit); const offset = resolveOffset(query.offset);
    const where: string[] = []; const params: unknown[] = [];
    const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace('?', `$${params.length}`)); };
    if (query.recipientId) add('n.recipient_id = ?', query.recipientId);
    if (query.status) add('n.status = ?', query.status);
    if (security.tenantId && !security.roles.includes('SUPER_ADMIN')) add('n.tenant_id = ?', security.tenantId);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text as count FROM health_notifications.notifications n ${clause}`, params);
      const rows = await session.query(`SELECT n.* FROM health_notifications.notifications n ${clause} ORDER BY n.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }
  async create(security: HealthSecurityContext, input: { recipientId?: string; recipientContact: string; channel: string; subject?: string; body: string; priority?: string; relatedResourceType?: string; relatedResourceId?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_notifications.notifications (tenant_id, recipient_id, recipient_type, recipient_contact, channel, subject, body, priority, related_resource_type, related_resource_id) VALUES ($1,$2,'USER',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.recipientId ?? security.userId, input.recipientContact, input.channel, input.subject ?? null, input.body, input.priority ?? 'NORMAL', input.relatedResourceType ?? null, input.relatedResourceId ?? null]);
      return (await session.query(`SELECT * FROM health_notifications.notifications WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'notification', resourceId: (result as any).id, newState: result as any }));
  }
  async templates(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_notifications.templates WHERE tenant_id=$1 ORDER BY code`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
}
