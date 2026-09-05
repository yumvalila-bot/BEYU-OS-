import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';

@Injectable()
export class ReportingRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async executiveDashboard(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const kpis = await session.query(`SELECT COUNT(DISTINCT p.id)::int as total_patients, COUNT(DISTINCT e.id)::int as total_encounters, COUNT(DISTINCT a.id)::int as total_appointments, COUNT(DISTINCT i.id)::int as total_invoices, COALESCE(SUM(i.total_minor),0)::bigint as total_revenue_minor, COALESCE(SUM(i.paid_minor),0)::bigint as total_collected_minor, COALESCE(SUM(i.balance_minor),0)::bigint as outstanding_minor FROM health_patient.patients p LEFT JOIN health_clinical.encounters e ON e.patient_id=p.id LEFT JOIN health_scheduling.appointments a ON a.patient_id=p.id LEFT JOIN health_billing.invoices i ON i.patient_id=p.id WHERE p.tenant_id=$1 AND p.deleted_at IS NULL`, [tenantId]).catch(()=>({ rows: [{}] }));
      const revenueByDept = await session.query(`SELECT f.name as facility, SUM(i.total_minor)::bigint as revenue, COUNT(i.id)::int as invoices FROM health_billing.invoices i JOIN health_tenant.facilities f ON f.id=i.facility_id WHERE i.tenant_id=$1 GROUP BY f.name ORDER BY revenue DESC LIMIT 10`, [tenantId]).catch(()=>({ rows: [] }));
      const patientVolume = await session.query(`SELECT date_trunc('day', created_at)::date as day, COUNT(*)::int as count FROM health_patient.patients WHERE tenant_id=$1 AND created_at > now() - interval '30 days' GROUP BY day ORDER BY day DESC`, [tenantId]);
      const ophthalmology = await session.query(`SELECT category, COUNT(*)::int as count, COUNT(*) FILTER (WHERE severity='SEVERE')::int as severe FROM health_ophthalmology.ophthalmic_diagnoses WHERE tenant_id=$1 AND status='ACTIVE' GROUP BY category ORDER BY count DESC`, [tenantId]);
      const inventory = await session.query(`SELECT COUNT(*) FILTER (WHERE status='ACTIVE')::int as active_items, COUNT(*) FILTER (WHERE reorder_level >= (SELECT COALESCE(SUM(quantity),0) FROM health_inventory.stock_batches sb WHERE sb.item_id=items.id))::int as low_stock FROM health_inventory.items items WHERE tenant_id=$1`, [tenantId]).catch(()=>({ rows: [{ active_items: 0, low_stock: 0 }] }));
      const workforce = await session.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE employment_status='ACTIVE')::int as active, COUNT(*) FILTER (WHERE specialty='Ophthalmology')::int as ophthalmologists FROM health_workforce.practitioners WHERE tenant_id=$1`, [tenantId]);
      const appointmentsToday = await session.query(`SELECT status, COUNT(*)::int as count FROM health_scheduling.appointments WHERE tenant_id=$1 AND start::date = CURRENT_DATE GROUP BY status`, [tenantId]);
      const bedOccupancy = await session.query(`SELECT status, COUNT(*)::int as count FROM health_tenant.beds WHERE facility_id IN (SELECT id FROM health_tenant.facilities WHERE tenant_id=$1) GROUP BY status`, [tenantId]);
      return {
        kpis: kpis.rows[0] ?? null,
        revenueByDept: (revenueByDept as any).rows ?? [],
        patientVolume: patientVolume.rows,
        ophthalmology: ophthalmology.rows,
        inventory: inventory.rows[0],
        workforce: workforce.rows[0],
        appointmentsToday: appointmentsToday.rows,
        bedOccupancy: bedOccupancy.rows,
      };
    });
  }

  async clinicalMetrics(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const diagnoses = await session.query(`SELECT display, COUNT(*)::int as count FROM health_clinical.conditions WHERE tenant_id=$1 GROUP BY display ORDER BY count DESC LIMIT 20`, [tenantId]);
      const encountersByClass = await session.query(`SELECT class, COUNT(*)::int as count FROM health_clinical.encounters WHERE tenant_id=$1 GROUP BY class`, [tenantId]);
      const avgLength = await session.query(`SELECT AVG(EXTRACT(EPOCH FROM (period_end - period_start))/3600)::numeric as avg_hours, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (period_end - period_start))/3600)::numeric as median_hours FROM health_clinical.encounters WHERE tenant_id=$1 AND period_end IS NOT NULL AND class='INPATIENT'`, [tenantId]);
      const readmissions = await session.query(`SELECT COUNT(*)::int as total_inpatient, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM health_clinical.encounters e2 WHERE e2.patient_id=e.patient_id AND e2.period_start > e.period_end AND e2.period_start < e.period_end + interval '30 days'))::int as readmissions_30d FROM health_clinical.encounters e WHERE tenant_id=$1 AND class='INPATIENT'`, [tenantId]);
      return { topDiagnoses: diagnoses.rows, encountersByClass: encountersByClass.rows, lengthOfStay: avgLength.rows[0], readmissions: readmissions.rows[0] };
    });
  }

  async operationalMetrics(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const queues = await session.query(`SELECT q.name, q.type, COUNT(qe.id) FILTER (WHERE qe.status='WAITING')::int as waiting, AVG(EXTRACT(EPOCH FROM (now() - qe.joined_at))/60)::numeric as avg_wait_minutes FROM health_scheduling.queues q LEFT JOIN health_scheduling.queue_entries qe ON qe.queue_id=q.id AND qe.status='WAITING' WHERE q.tenant_id=$1 GROUP BY q.id, q.name, q.type`, [tenantId]).catch(()=>({ rows: [] }));
      const labTat = await session.query(`SELECT c.name as test_name, AVG(EXTRACT(EPOCH FROM (r.performed_at - o.ordered_at))/3600)::numeric as avg_tat_hours, COUNT(*)::int as volume FROM health_lab.lab_results r JOIN health_lab.lab_orders o ON o.id=r.order_id JOIN health_lab.test_catalog c ON c.id=r.test_id WHERE r.tenant_id=$1 GROUP BY c.name ORDER BY volume DESC LIMIT 20`, [tenantId]);
      const pharmacy = await session.query(`SELECT COUNT(*)::int as total_prescriptions, COUNT(*) FILTER (WHERE status='COMPLETED')::int as dispensed, COUNT(*) FILTER (WHERE status='ACTIVE')::int as pending FROM health_pharmacy.prescriptions WHERE tenant_id=$1`, [tenantId]);
      return { queues: (queues as any).rows ?? [], labTat: labTat.rows, pharmacy: pharmacy.rows[0] };
    });
  }

  async mtuhaReports(security: HealthSecurityContext, facilityId?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE m.tenant_id=$1`;
      if (facilityId) { params.push(facilityId); where += ` AND m.facility_id=$${params.length}`; }
      const rows = await session.query(`SELECT m.*, f.name as facility_name FROM health_reporting.mtuha_reports m JOIN health_tenant.facilities f ON f.id=m.facility_id ${where} ORDER BY m.period_start DESC LIMIT 50`, params);
      return rows.rows;
    });
  }

  async createMtuhaReport(security: HealthSecurityContext, input: { facilityId: string; reportType: string; periodStart: string; periodEnd: string; data: any }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_reporting.mtuha_reports (tenant_id, facility_id, report_type, period_start, period_end, data, status) VALUES ($1,$2,$3,$4,$5,$6,'DRAFT') RETURNING id`, [tenantId, input.facilityId, input.reportType, input.periodStart, input.periodEnd, JSON.stringify(input.data)]);
      return (await session.query(`SELECT * FROM health_reporting.mtuha_reports WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result: any) => ({ action: 'CREATE', resourceType: 'mtuha_report', resourceId: result.id, newState: result }));
  }

  async reportDefinitions(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT * FROM health_reporting.report_definitions WHERE tenant_id=$1 OR tenant_id IS NULL ORDER BY category, name`, [security.activeTenantId ?? security.tenantId]);
      return rows.rows;
    });
  }
}
