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
      const kpis = await session.query(`SELECT * FROM health_reporting.executive_kpis WHERE tenant_id=$1`, [tenantId]).catch(async () => {
        return await session.query(`
          SELECT 
            $1::uuid as tenant_id,
            (SELECT COUNT(*)::int FROM health_patient.patients WHERE tenant_id=$1 AND deleted_at IS NULL) as total_patients,
            (SELECT COUNT(*)::int FROM health_clinical.encounters WHERE tenant_id=$1) as total_encounters,
            (SELECT COUNT(*)::int FROM health_scheduling.appointments WHERE tenant_id=$1) as total_appointments,
            (SELECT COUNT(*)::int FROM health_billing.invoices WHERE tenant_id=$1) as total_invoices,
            (SELECT COALESCE(SUM(total_minor),0)::bigint FROM health_billing.invoices WHERE tenant_id=$1) as total_revenue_minor,
            (SELECT COALESCE(SUM(paid_minor),0)::bigint FROM health_billing.invoices WHERE tenant_id=$1) as total_collected_minor
        `, [tenantId]);
      });
      const revenueByDept = await session.query(`SELECT d.name as department, SUM(i.total_minor) as revenue FROM health_billing.invoices i JOIN health_tenant.departments d ON d.id=i.facility_id WHERE i.tenant_id=$1 GROUP BY d.name ORDER BY revenue DESC LIMIT 10`, [tenantId]).catch(()=>({ rows: [] }));
      const patientVolume = await session.query(`SELECT date_trunc('month', created_at)::date as month, COUNT(*)::int as count FROM health_patient.patients WHERE tenant_id=$1 GROUP BY month ORDER BY month DESC LIMIT 12`, [tenantId]);
      const ophthalmology = await session.query(`SELECT category, COUNT(*)::int as count FROM health_ophthalmology.ophthalmic_diagnoses WHERE tenant_id=$1 GROUP BY category ORDER BY count DESC`, [tenantId]);
      const inventory = await session.query(`SELECT COUNT(*) FILTER (WHERE status='ACTIVE')::int as active_items, COUNT(*) FILTER (WHERE reorder_level >= (SELECT COALESCE(SUM(quantity),0) FROM health_inventory.stock_batches sb WHERE sb.item_id=items.id))::int as low_stock FROM health_inventory.items items WHERE tenant_id=$1`, [tenantId]).catch(()=>({ rows: [{ active_items: 0, low_stock: 0 }] }));
      const workforce = await session.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE employment_status='ACTIVE')::int as active FROM health_workforce.practitioners WHERE tenant_id=$1`, [tenantId]);
      return {
        kpis: kpis.rows[0] ?? null,
        revenueByDept: (revenueByDept as any).rows ?? [],
        patientVolume: patientVolume.rows,
        ophthalmology: ophthalmology.rows,
        inventory: inventory.rows[0],
        workforce: workforce.rows[0],
      };
    });
  }

  async clinicalMetrics(security: HealthSecurityContext) {
    return this.read(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const diagnoses = await session.query(`SELECT display, COUNT(*)::int as count FROM health_clinical.conditions WHERE tenant_id=$1 GROUP BY display ORDER BY count DESC LIMIT 20`, [tenantId]);
      const encountersByClass = await session.query(`SELECT class, COUNT(*)::int as count FROM health_clinical.encounters WHERE tenant_id=$1 GROUP BY class`, [tenantId]);
      const avgLength = await session.query(`SELECT AVG(EXTRACT(EPOCH FROM (period_end - period_start))/3600)::numeric as avg_hours FROM health_clinical.encounters WHERE tenant_id=$1 AND period_end IS NOT NULL AND class='INPATIENT'`, [tenantId]);
      return { topDiagnoses: diagnoses.rows, encountersByClass: encountersByClass.rows, avgLengthOfStayHours: avgLength.rows[0]?.avg_hours ?? 0 };
    });
  }
}
