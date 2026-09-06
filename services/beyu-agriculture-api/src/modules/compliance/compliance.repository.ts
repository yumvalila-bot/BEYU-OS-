import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository, resolveLimit, resolveOffset, type Page } from '../../common/domain.repository';
import type { AgriSecurityContext } from '../../common/security';
import { notFound, badRequest, forbidden, conflict } from '../../common/errors';

/** Certifications, inspections and lot traceability. */
@Injectable()
export class ComplianceRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  private tenantOf(security: AgriSecurityContext, explicit?: string | null): string | null {
    const tenantId = explicit ?? security.activeTenantId ?? security.tenantId;
    if (!tenantId && !security.roles.includes('SUPER_ADMIN')) forbidden('No tenant membership');
    return tenantId;
  }

  async listCertifications(security: AgriSecurityContext, query: { farmId?: string; status?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['c.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`c.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`c.farm_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`c.status = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_compliance.certifications c ${clause}`, params);
      const rows = await session.query(
        `SELECT c.*, f.name AS farm_name FROM agri_compliance.certifications c
         LEFT JOIN agri_farm.farms f ON f.id=c.farm_id ${clause}
         ORDER BY c.expires_on ASC NULLS FIRST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  async createCertification(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; certificationType: string; certificateNumber: string; issuedOn?: string | null; expiresOn?: string | null; issuedBy?: string | null; scopeNotes?: string | null }): Promise<any> {
    if (!input.certificationType || !input.certificateNumber) badRequest('certificationType and certificateNumber are required');
    // Snapshot to plain locals up front: defensive against any downstream
    // mutation of the request body object between validation and the write.
    const certNumber = String(input.certificateNumber);
    const certType = String(input.certificationType);
    const tenantId = this.tenantOf(security, input.tenantId);
    if (!tenantId) badRequest('tenant membership required');
    return this.mutate(security, async (session) => {
      if (input.farmId) {
        const farm = await session.query<any>(`SELECT * FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        this.assertRowVisible(security, farm.rows[0], 'farm', input.farmId);
      }
      if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) badRequest('expiresOn must be after issuedOn');
      // Duplicate certificate numbers are a business conflict (409). The
      // SELECT pre-check covers production Postgres; on the embedded PGLite
      // dev/test driver a repeated parameterized SELECT text inside a
      // context transaction can serve a stale empty result, so the INSERT's
      // unique constraint (certs_tenant_number_unique) is the authoritative
      // backstop and is mapped to the same 409.
      const dupe = await session.query(`SELECT id FROM agri_compliance.certifications WHERE tenant_id=$1 AND certificate_number=$2 AND deleted_at IS NULL`, [tenantId, certNumber]);
      if (dupe.rows[0]) conflict('certificate number already exists in tenant');
      let res: { rows: Array<{ id: string }> };
      const insParams = [tenantId, input.farmId ?? null, certType, certNumber, input.issuedOn ?? null, input.expiresOn ?? null, input.issuedBy ?? null, input.scopeNotes ?? null];
      try {
          res = await session.query<{ id: string }>(
          `INSERT INTO agri_compliance.certifications (tenant_id, farm_id, certification_type, certificate_number, status, issued_on, expires_on, issued_by, scope_notes) /*v3*/
           VALUES ($1,$2,$3,$4,'CERTIFIED',$5,$6,$7,$8) RETURNING id`,
          insParams,
        );
      } catch (err: unknown) {
          const e = err as { constraint?: string; code?: string; message?: string };
        if ((e.constraint ?? '').includes('certs_tenant_number_unique') || e.code === '23505' || (e.message ?? '').includes('certs_tenant_number_unique')) {
          conflict('certificate number already exists in tenant');
        }
        throw err;
      }
      const row = await session.query(`SELECT * FROM agri_compliance.certifications WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'certification', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async createInspection(security: AgriSecurityContext, input: { tenantId?: string; farmId?: string | null; certificationId?: string | null; inspectedOn: string; inspectedBy?: string | null; result: string; findings?: string | null; followUpRequired?: boolean }): Promise<any> {
    if (!input.inspectedOn || !input.result) badRequest('inspectedOn and result are required');
    const tenantId = this.tenantOf(security, input.tenantId);
    if (!tenantId) badRequest('tenant membership required');
    return this.mutate(security, async (session) => {
      if (input.farmId) {
        const farm = await session.query<any>(`SELECT * FROM agri_farm.farms WHERE id=$1 AND deleted_at IS NULL`, [input.farmId]);
        if (!farm.rows[0]) notFound('farm', input.farmId);
        this.assertRowVisible(security, farm.rows[0], 'farm', input.farmId);
      }
      if (input.certificationId) {
        const cert = await session.query<any>(`SELECT * FROM agri_compliance.certifications WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [input.certificationId]);
        if (!cert.rows[0]) notFound('certification', input.certificationId);
        this.assertRowVisible(security, cert.rows[0], 'certification', input.certificationId);
        if (input.result === 'FAIL') {
          await session.query(`UPDATE agri_compliance.certifications SET status='SUSPENDED', updated_at=now() WHERE id=$1`, [input.certificationId]);
        }
      }
      const res = await session.query<{ id: string }>(
        `INSERT INTO agri_compliance.inspections (tenant_id, farm_id, certification_id, inspected_on, inspected_by, result, findings, follow_up_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, input.farmId ?? null, input.certificationId ?? null, input.inspectedOn, input.inspectedBy ?? null, input.result, input.findings ?? null, input.followUpRequired ?? false],
      );
      const row = await session.query(`SELECT * FROM agri_compliance.inspections WHERE id=$1`, [res.rows[0].id]);
      return row.rows[0];
    }, (result) => ({
      action: 'CREATE', resourceType: 'inspection', resourceId: (result as any).id, newState: result as any,
    }));
  }

  async listInspections(security: AgriSecurityContext, query: { farmId?: string; result?: string; limit?: number; offset?: number }): Promise<Page<any>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);
    const where: string[] = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    const tenantId = this.tenantOf(security);
    if (tenantId) { params.push(tenantId); where.push(`i.tenant_id = $${params.length}`); }
    if (query.farmId) { params.push(query.farmId); where.push(`i.farm_id = $${params.length}`); }
    if (query.result) { params.push(query.result); where.push(`i.result = $${params.length}`); }
    const clause = `WHERE ${where.join(' AND ')}`;
    return this.read(security, async (session) => {
      const count = await session.query<{ count: string }>(`SELECT count(*)::text AS count FROM agri_compliance.inspections i ${clause}`, params);
      const rows = await session.query(`SELECT i.* FROM agri_compliance.inspections i ${clause} ORDER BY i.inspected_on DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { items: rows.rows, total: Number(count.rows[0]?.count ?? 0), limit, offset };
    });
  }

  /** Full backward traceability chain for a storage lot. */
  async trace(security: AgriSecurityContext, storageLotId: string): Promise<any> {
    return this.read(security, async (session) => {
      const lot = await session.query<any>(`SELECT * FROM agri_crop.storage_lots WHERE id=$1`, [storageLotId]);
      if (!lot.rows[0]) notFound('storage_lot', storageLotId);
      this.assertRowVisible(security, lot.rows[0], 'storage_lot', storageLotId);
      const lotRow = lot.rows[0];
      const report: any = {
        storageLot: { id: lotRow.id, lotCode: lotRow.lot_code, cropId: lotRow.crop_id, quantityKg: Number(lotRow.quantity_kg), status: lotRow.status },
        harvest: null, cropCycle: null, field: null, farm: null, activities: [], salesOrders: [],
      };
      if (lotRow.harvest_id) {
        const harvest = await session.query<any>(`SELECT * FROM agri_crop.harvests WHERE id=$1`, [lotRow.harvest_id]);
        if (harvest.rows[0]) {
          const h = harvest.rows[0];
          report.harvest = { id: h.id, harvestedOn: h.harvested_on, quantityKg: Number(h.quantity_kg), qualityGrade: h.quality_grade, cropCycleId: h.crop_cycle_id };
          const cycle = await session.query<any>(`SELECT * FROM agri_crop.crop_cycles WHERE id=$1`, [h.crop_cycle_id]);
          if (cycle.rows[0]) {
            const cc = cycle.rows[0];
            report.cropCycle = { id: cc.id, seasonCode: cc.season_code, status: cc.status, cropId: cc.crop_id, fieldId: cc.field_id };
            const field = await session.query<any>(`SELECT * FROM agri_farm.fields WHERE id=$1`, [cc.field_id]);
            if (field.rows[0]) {
              const fl = field.rows[0];
              report.field = { id: fl.id, code: fl.code, name: fl.name, farmId: fl.farm_id, areaHa: Number(fl.area_ha) };
              const farm = await session.query<any>(`SELECT * FROM agri_farm.farms WHERE id=$1`, [fl.farm_id]);
              if (farm.rows[0]) {
                const fm = farm.rows[0];
                report.farm = { id: fm.id, code: fm.code, name: fm.name, countryCode: fm.country_code };
              }
            }
          }
          const activities = await session.query(
            `SELECT id, activity_type, performed_on, notes FROM agri_crop.field_activities WHERE crop_cycle_id=$1 ORDER BY performed_on NULLS LAST`,
            [h.crop_cycle_id],
          );
          report.activities = activities.rows.map((a: any) => ({ id: a.id, activityType: a.activity_type, performedOn: a.performed_on, notes: a.notes }));
        }
      }
      const sales = await session.query(
        `SELECT id, so_number, buyer_id, status, order_date FROM agri_procurement.sales_orders WHERE storage_lot_id=$1 ORDER BY order_date DESC`,
        [storageLotId],
      );
      report.salesOrders = sales.rows.map((s: any) => ({ id: s.id, soNumber: s.so_number, buyerId: s.buyer_id, status: s.status, orderDate: s.order_date }));
      return report;
    });
  }
}
