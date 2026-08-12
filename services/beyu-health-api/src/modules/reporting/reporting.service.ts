import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE } from '../../core/database.token';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';

/**
 * BEYU HEALTH OS — Automatic Report Generation Service
 * Includes MTUHA (Tanzania) and operational reports
 * Spec §26 Reporting, Tanzania pack MTUHA
 */

export interface MTUHABook6Data {
  periodStart: string;
  periodEnd: string;
  facilityId: string;
  facilityName: string;
  totalEncounters: number;
  byGender: { male: number; female: number; other: number };
  byAgeGroup: Record<string, number>;
  byDiagnosis: Array<{ code: string; name: string; count: number }>;
  newVsReattendance: { new: number; reattendance: number };
  dailyBreakdown: Array<{ date: string; count: number }>;
}

export interface MTUHABook8Data {
  periodStart: string;
  periodEnd: string;
  totalAdmissions: number;
  totalDischarges: number;
  byOutcome: Record<string, number>;
  avgLengthOfStay: number;
  byDiagnosis: Array<{ code: string; name: string; count: number }>;
}

export interface MTUHA2Summary {
  periodYear: number;
  periodMonth: number;
  facilityId: string;
  opdTotal: number;
  opdUnder5: number;
  opdOver5: number;
  ipdTotal: number;
  ipdUnder5: number;
  ipdOver5: number;
  deliveriesTotal: number;
  liveBirths: number;
  stillBirths: number;
  malariaCases: number;
  pneumoniaCases: number;
  diarrheaCases: number;
  ophthalmologyTotal: number;
  cataractCases: number;
  glaucomaCases: number;
  diabeticRetinopathyCases: number;
}

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
  ) {}

  /**
   * Automatically generate MTUHA Book 6 - Outpatient Register
   * Daily summary of OPD attendance by age, gender, diagnosis
   */
  async generateBook6(tenantId: string, facilityId: string, periodStart: string, periodEnd: string): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Generating MTUHA Book 6 for facility ${facilityId} period ${periodStart} to ${periodEnd}`);

    return this.db.transaction(async (session) => {
      // Get facility info
      const facility = await session.query<{ name: string }>(`SELECT name FROM health_tenant.facilities WHERE id=$1`, [facilityId]);
      const facilityName = facility.rows[0]?.name ?? 'Unknown';

      // Main OPD encounters
      const encounters = await session.query<{
        total: string;
        male: string;
        female: string;
        other: string;
      }>(`
        SELECT 
          COUNT(*)::text as total,
          COUNT(*) FILTER (WHERE p.gender='MALE')::text as male,
          COUNT(*) FILTER (WHERE p.gender='FEMALE')::text as female,
          COUNT(*) FILTER (WHERE p.gender NOT IN ('MALE','FEMALE'))::text as other
        FROM health_clinical.encounters e
        JOIN health_patient.patients p ON p.id = e.patient_id
        WHERE e.tenant_id=$1 AND e.facility_id=$2 
          AND e.class IN ('OUTPATIENT','AMBULATORY','EMERGENCY')
          AND e.period_start::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Age group breakdown using MTUHA age groups
      const ageGroups = await session.query<{ age_group: string; count: string }>(`
        SELECT 
          health_reporting.calculate_age_group(p.date_of_birth, e.period_start::date) as age_group,
          COUNT(*)::text as count
        FROM health_clinical.encounters e
        JOIN health_patient.patients p ON p.id = e.patient_id
        WHERE e.tenant_id=$1 AND e.facility_id=$2 
          AND e.class IN ('OUTPATIENT','AMBULATORY','EMERGENCY')
          AND e.period_start::date BETWEEN $3 AND $4
        GROUP BY health_reporting.calculate_age_group(p.date_of_birth, e.period_start::date)
        ORDER BY count DESC
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Diagnosis breakdown
      const diagnoses = await session.query<{ code: string; display: string; count: string }>(`
        SELECT c.code, c.display, COUNT(*)::text as count
        FROM health_clinical.conditions c
        JOIN health_clinical.encounters e ON e.id = c.encounter_id
        WHERE c.tenant_id=$1 AND e.facility_id=$2 AND c.recorded_date::date BETWEEN $3 AND $4
        GROUP BY c.code, c.display
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Daily breakdown
      const daily = await session.query<{ date: string; count: string }>(`
        SELECT e.period_start::date::text as date, COUNT(*)::text as count
        FROM health_clinical.encounters e
        WHERE e.tenant_id=$1 AND e.facility_id=$2 
          AND e.class IN ('OUTPATIENT','AMBULATORY','EMERGENCY')
          AND e.period_start::date BETWEEN $3 AND $4
        GROUP BY e.period_start::date
        ORDER BY e.period_start::date
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // New vs re-attendance (simplified: first encounter vs follow-up)
      const newVsRe = await session.query<{ new_count: string; re_count: string }>(`
        SELECT 
          COUNT(DISTINCT CASE WHEN first_enc.first_date = e.period_start::date THEN e.patient_id END)::text as new_count,
          COUNT(DISTINCT CASE WHEN first_enc.first_date < e.period_start::date THEN e.patient_id END)::text as re_count
        FROM health_clinical.encounters e
        JOIN (
          SELECT patient_id, MIN(period_start::date) as first_date
          FROM health_clinical.encounters
          WHERE tenant_id=$1 AND facility_id=$2
          GROUP BY patient_id
        ) first_enc ON first_enc.patient_id = e.patient_id
        WHERE e.tenant_id=$1 AND e.facility_id=$2
          AND e.class IN ('OUTPATIENT','AMBULATORY','EMERGENCY')
          AND e.period_start::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const byAge: Record<string, number> = {};
      ageGroups.rows.forEach(r => { byAge[r.age_group] = Number(r.count); });

      const result = {
        periodStart,
        periodEnd,
        facilityId,
        facilityName,
        totalEncounters: Number(encounters.rows[0]?.total ?? 0),
        byGender: {
          male: Number(encounters.rows[0]?.male ?? 0),
          female: Number(encounters.rows[0]?.female ?? 0),
          other: Number(encounters.rows[0]?.other ?? 0),
        },
        byAgeGroup: byAge,
        byDiagnosis: diagnoses.rows.map(r => ({ code: r.code, name: r.display, count: Number(r.count) })),
        newVsReattendance: {
          new: Number(newVsRe.rows[0]?.new_count ?? 0),
          reattendance: Number(newVsRe.rows[0]?.re_count ?? 0),
        },
        dailyBreakdown: daily.rows.map(r => ({ date: r.date, count: Number(r.count) })),
      };

      // Save to mtuha_reports and auto_generated_reports
      const reportRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.mtuha_reports (tenant_id, facility_id, report_type, period_start, period_end, data, status)
        VALUES ($1,$2,'BOOK6',$3,$4,$5,'COMPLETED')
        RETURNING id
      `, [tenantId, facilityId, periodStart, periodEnd, JSON.stringify(result)]);

      const autoRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, data, summary, completed_at, generation_time_ms)
        VALUES ($1,$2,'BOOK6',$3,$4,'COMPLETED',$5,$6,now(),$7)
        RETURNING id
      `, [
        tenantId,
        facilityId,
        periodStart,
        periodEnd,
        JSON.stringify(result),
        JSON.stringify({
          total: result.totalEncounters,
          male: result.byGender.male,
          female: result.byGender.female,
          topDiagnosis: result.byDiagnosis[0]?.name ?? 'None',
        }),
        Date.now() - startTime,
      ]);

      // Audit log for auto generation
      await session.query(`
        INSERT INTO health_reporting.report_generation_audit (tenant_id, report_id, action, performed_by, details)
        VALUES ($1,$2,'COMPLETED','SYSTEM',$3)
      `, [tenantId, autoRes.rows[0].id, JSON.stringify({ reportType: 'BOOK6', facilityId, periodStart, periodEnd, generationTimeMs: Date.now() - startTime })]);

      this.logger.log(`MTUHA Book 6 generated: ${result.totalEncounters} encounters for ${facilityName}`);
      return { ...result, reportId: reportRes.rows[0].id, autoReportId: autoRes.rows[0].id };
    });
  }

  /**
   * Generate MTUHA Book 8 - Inpatient Register
   */
  async generateBook8(tenantId: string, facilityId: string, periodStart: string, periodEnd: string): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Generating MTUHA Book 8 for facility ${facilityId} period ${periodStart} to ${periodEnd}`);

    return this.db.transaction(async (session) => {
      const facility = await session.query<{ name: string }>(`SELECT name FROM health_tenant.facilities WHERE id=$1`, [facilityId]);
      const facilityName = facility.rows[0]?.name ?? 'Unknown';

      const admissions = await session.query<{
        total_admissions: string;
        total_discharges: string;
        avg_los: string;
      }>(`
        SELECT 
          COUNT(*)::text as total_admissions,
          COUNT(*) FILTER (WHERE status='DISCHARGED')::text as total_discharges,
          COALESCE(AVG(EXTRACT(EPOCH FROM (discharge_at - admitted_at))/86400),0)::text as avg_los
        FROM health_scheduling.admissions
        WHERE tenant_id=$1 AND facility_id=$2 AND admitted_at::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const outcomes = await session.query<{ outcome: string; count: string }>(`
        SELECT COALESCE(discharge_summary, status) as outcome, COUNT(*)::text as count
        FROM health_scheduling.admissions
        WHERE tenant_id=$1 AND facility_id=$2 AND admitted_at::date BETWEEN $3 AND $4
        GROUP BY COALESCE(discharge_summary, status)
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const diagnoses = await session.query<{ code: string; display: string; count: string }>(`
        SELECT c.code, c.display, COUNT(*)::text as count
        FROM health_clinical.conditions c
        JOIN health_clinical.encounters e ON e.id = c.encounter_id
        WHERE c.tenant_id=$1 AND e.facility_id=$2 AND e.class='INPATIENT' AND e.period_start::date BETWEEN $3 AND $4
        GROUP BY c.code, c.display
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const byOutcome: Record<string, number> = {};
      outcomes.rows.forEach(r => { byOutcome[r.outcome] = Number(r.count); });

      const result = {
        periodStart,
        periodEnd,
        facilityId,
        facilityName,
        totalAdmissions: Number(admissions.rows[0]?.total_admissions ?? 0),
        totalDischarges: Number(admissions.rows[0]?.total_discharges ?? 0),
        byOutcome,
        avgLengthOfStay: Number(admissions.rows[0]?.avg_los ?? 0),
        byDiagnosis: diagnoses.rows.map(r => ({ code: r.code, name: r.display, count: Number(r.count) })),
      };

      const reportRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.mtuha_reports (tenant_id, facility_id, report_type, period_start, period_end, data, status)
        VALUES ($1,$2,'BOOK8',$3,$4,$5,'COMPLETED')
        RETURNING id
      `, [tenantId, facilityId, periodStart, periodEnd, JSON.stringify(result)]);

      const autoRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, data, summary, completed_at, generation_time_ms)
        VALUES ($1,$2,'BOOK8',$3,$4,'COMPLETED',$5,$6,now(),$7)
        RETURNING id
      `, [
        tenantId,
        facilityId,
        periodStart,
        periodEnd,
        JSON.stringify(result),
        JSON.stringify({ totalAdmissions: result.totalAdmissions, avgLos: result.avgLengthOfStay }),
        Date.now() - startTime,
      ]);

      return { ...result, reportId: reportRes.rows[0].id, autoReportId: autoRes.rows[0].id };
    });
  }

  /**
   * Generate MTUHA 2 - Monthly Summary (MOH)
   * Aggregates OPD, IPD, deliveries, malaria, pneumonia, diarrhea, ophthalmology
   */
  async generateMTUHA2(tenantId: string, facilityId: string, year: number, month: number): Promise<MTUHA2Summary> {
    const startTime = Date.now();
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);
    this.logger.log(`Generating MTUHA 2 for facility ${facilityId} period ${periodStart} to ${periodEnd}`);

    return this.db.transaction(async (session) => {
      // OPD counts
      const opd = await session.query<{ total: string; under5: string; over5: string }>(`
        SELECT 
          COUNT(*)::text as total,
          COUNT(*) FILTER (WHERE p.date_of_birth > CURRENT_DATE - INTERVAL '5 years')::text as under5,
          COUNT(*) FILTER (WHERE p.date_of_birth <= CURRENT_DATE - INTERVAL '5 years')::text as over5
        FROM health_clinical.encounters e
        JOIN health_patient.patients p ON p.id = e.patient_id
        WHERE e.tenant_id=$1 AND e.facility_id=$2 
          AND e.class IN ('OUTPATIENT','AMBULATORY','EMERGENCY')
          AND e.period_start::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // IPD counts
      const ipd = await session.query<{ total: string; under5: string; over5: string }>(`
        SELECT 
          COUNT(*)::text as total,
          COUNT(*) FILTER (WHERE p.date_of_birth > CURRENT_DATE - INTERVAL '5 years')::text as under5,
          COUNT(*) FILTER (WHERE p.date_of_birth <= CURRENT_DATE - INTERVAL '5 years')::text as over5
        FROM health_scheduling.admissions a
        JOIN health_patient.patients p ON p.id = a.patient_id
        WHERE a.tenant_id=$1 AND a.facility_id=$2 AND a.admitted_at::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Malaria, pneumonia, diarrhea from conditions
      const diseaseCounts = await session.query<{ malaria: string; pneumonia: string; diarrhea: string }>(`
        SELECT 
          COUNT(*) FILTER (WHERE LOWER(c.display) LIKE '%malaria%')::text as malaria,
          COUNT(*) FILTER (WHERE LOWER(c.display) LIKE '%pneumonia%')::text as pneumonia,
          COUNT(*) FILTER (WHERE LOWER(c.display) LIKE '%diarrh%' OR LOWER(c.display) LIKE '%gastroenteritis%')::text as diarrhea
        FROM health_clinical.conditions c
        JOIN health_clinical.encounters e ON e.id = c.encounter_id
        WHERE c.tenant_id=$1 AND e.facility_id=$2 AND c.recorded_date::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Ophthalmology counts
      const ophth = await session.query<{
        total: string;
        cataract: string;
        glaucoma: string;
        dr: string;
      }>(`
        SELECT 
          COUNT(*)::text as total,
          COUNT(*) FILTER (WHERE category='CATARACT')::text as cataract,
          COUNT(*) FILTER (WHERE category='GLAUCOMA')::text as glaucoma,
          COUNT(*) FILTER (WHERE category='DIABETIC_RETINOPATHY')::text as dr
        FROM health_ophthalmology.ophthalmic_diagnoses
        WHERE tenant_id=$1 AND encounter_id IN (SELECT id FROM health_clinical.encounters WHERE facility_id=$2)
          AND recorded_at::date BETWEEN $3 AND $4
      `, [tenantId, facilityId, periodStart, periodEnd]);

      // Deliveries (simplified from encounters with type delivery)
      const deliveries = await session.query<{ total: string; live: string; still: string }>(`
        SELECT 
          COUNT(*) FILTER (WHERE LOWER(e.type) LIKE '%deliver%' OR LOWER(e.reason) LIKE '%deliver%')::text as total,
          COUNT(*) FILTER (WHERE LOWER(e.type) LIKE '%live birth%' OR LOWER(e.reason) LIKE '%live birth%')::text as live,
          COUNT(*) FILTER (WHERE LOWER(e.type) LIKE '%still birth%' OR LOWER(e.reason) LIKE '%still%')::text as still
        FROM health_clinical.encounters e
        WHERE e.tenant_id=$1 AND e.facility_id=$2 
          AND e.period_start::date BETWEEN $3 AND $4
          AND (LOWER(e.type) LIKE '%deliver%' OR LOWER(e.reason) LIKE '%deliver%' OR LOWER(e.type) LIKE '%birth%')
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const summary: MTUHA2Summary = {
        periodYear: year,
        periodMonth: month,
        facilityId,
        opdTotal: Number(opd.rows[0]?.total ?? 0),
        opdUnder5: Number(opd.rows[0]?.under5 ?? 0),
        opdOver5: Number(opd.rows[0]?.over5 ?? 0),
        ipdTotal: Number(ipd.rows[0]?.total ?? 0),
        ipdUnder5: Number(ipd.rows[0]?.under5 ?? 0),
        ipdOver5: Number(ipd.rows[0]?.over5 ?? 0),
        deliveriesTotal: Number(deliveries.rows[0]?.total ?? 0),
        liveBirths: Number(deliveries.rows[0]?.live ?? 0),
        stillBirths: Number(deliveries.rows[0]?.still ?? 0),
        malariaCases: Number(diseaseCounts.rows[0]?.malaria ?? 0),
        pneumoniaCases: Number(diseaseCounts.rows[0]?.pneumonia ?? 0),
        diarrheaCases: Number(diseaseCounts.rows[0]?.diarrhea ?? 0),
        ophthalmologyTotal: Number(ophth.rows[0]?.total ?? 0),
        cataractCases: Number(ophth.rows[0]?.cataract ?? 0),
        glaucomaCases: Number(ophth.rows[0]?.glaucoma ?? 0),
        diabeticRetinopathyCases: Number(ophth.rows[0]?.dr ?? 0),
      };

      // Upsert monthly summary
      await session.query(`
        INSERT INTO health_reporting.mtuha_monthly_summary 
          (tenant_id, facility_id, report_type, period_year, period_month, opd_total, opd_under5, opd_over5, ipd_total, ipd_under5, ipd_over5, 
           deliveries_total, live_births, still_births, malaria_cases, pneumonia_cases, diarrhea_cases, 
           ophthalmology_total, cataract_cases, glaucoma_cases, diabetic_retinopathy_cases, data)
        VALUES ($1,$2,'MTUHA2',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (tenant_id, facility_id, report_type, period_year, period_month)
        DO UPDATE SET 
          opd_total=$5, opd_under5=$6, opd_over5=$7, ipd_total=$8, ipd_under5=$9, ipd_over5=$10,
          deliveries_total=$11, live_births=$12, still_births=$13, malaria_cases=$14, pneumonia_cases=$15, diarrhea_cases=$16,
          ophthalmology_total=$17, cataract_cases=$18, glaucoma_cases=$19, diabetic_retinopathy_cases=$20, data=$21, updated_at=now()
      `, [
        tenantId,
        facilityId,
        year,
        month,
        summary.opdTotal,
        summary.opdUnder5,
        summary.opdOver5,
        summary.ipdTotal,
        summary.ipdUnder5,
        summary.ipdOver5,
        summary.deliveriesTotal,
        summary.liveBirths,
        summary.stillBirths,
        summary.malariaCases,
        summary.pneumoniaCases,
        summary.diarrheaCases,
        summary.ophthalmologyTotal,
        summary.cataractCases,
        summary.glaucomaCases,
        summary.diabeticRetinopathyCases,
        JSON.stringify(summary),
      ]);

      // Also create mtuha_reports entry
      const reportRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.mtuha_reports (tenant_id, facility_id, report_type, period_start, period_end, data, status)
        VALUES ($1,$2,'MTUHA2',$3,$4,$5,'COMPLETED')
        RETURNING id
      `, [tenantId, facilityId, periodStart, periodEnd, JSON.stringify(summary)]);

      const autoRes = await session.query<{ id: string }>(`
        INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, data, summary, completed_at, generation_time_ms)
        VALUES ($1,$2,'MTUHA2',$3,$4,'COMPLETED',$5,$6,now(),$7)
        RETURNING id
      `, [
        tenantId,
        facilityId,
        periodStart,
        periodEnd,
        JSON.stringify(summary),
        JSON.stringify({ opd: summary.opdTotal, ipd: summary.ipdTotal, deliveries: summary.deliveriesTotal, ophthalmology: summary.ophthalmologyTotal }),
        Date.now() - startTime,
      ]);

      this.logger.log(`MTUHA 2 generated for ${year}-${month}: OPD ${summary.opdTotal}, IPD ${summary.ipdTotal}, Ophthalmology ${summary.ophthalmologyTotal}`);

      return { ...summary, reportId: reportRes.rows[0].id, autoReportId: autoRes.rows[0].id };
    });
  }

  /**
   * Automatically generate all reports for a facility and period
   */
  async generateAllReports(tenantId: string, facilityId: string, periodStart: string, periodEnd: string): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`Auto-generating all reports for facility ${facilityId} period ${periodStart} to ${periodEnd}`);

    const results: any = {};
    try {
      results.book6 = await this.generateBook6(tenantId, facilityId, periodStart, periodEnd);
    } catch (e) {
      this.logger.error(`Book 6 generation failed: ${(e as Error).message}`);
      results.book6Error = (e as Error).message;
    }

    try {
      results.book8 = await this.generateBook8(tenantId, facilityId, periodStart, periodEnd);
    } catch (e) {
      this.logger.error(`Book 8 generation failed: ${(e as Error).message}`);
      results.book8Error = (e as Error).message;
    }

    // MTUHA 2 for each month in period
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const monthly: any[] = [];
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      try {
        const mtuha2 = await this.generateMTUHA2(tenantId, facilityId, year, month);
        monthly.push(mtuha2);
      } catch (e) {
        this.logger.error(`MTUHA2 ${year}-${month} failed: ${(e as Error).message}`);
      }
    }
    results.mtuha2 = monthly;

    // Generate additional operational reports
    results.revenueDaily = await this.generateRevenueDaily(tenantId, facilityId, periodStart, periodEnd);
    results.ophthalmologyMonthly = await this.generateOphthalmologyMonthly(tenantId, facilityId, periodStart, periodEnd);

    this.logger.log(`All reports generated in ${Date.now() - startTime}ms for facility ${facilityId}`);
    return { ...results, generationTimeMs: Date.now() - startTime, periodStart, periodEnd, facilityId };
  }

  async generateRevenueDaily(tenantId: string, facilityId: string, periodStart: string, periodEnd: string): Promise<any> {
    return this.db.transaction(async (session) => {
      const revenue = await session.query<{
        date: string;
        total_minor: string;
        paid_minor: string;
        invoice_count: string;
      }>(`
        SELECT 
          created_at::date::text as date,
          SUM(total_minor)::text as total_minor,
          SUM(paid_minor)::text as paid_minor,
          COUNT(*)::text as invoice_count
        FROM health_billing.invoices
        WHERE tenant_id=$1 AND facility_id=$2 AND created_at::date BETWEEN $3 AND $4
        GROUP BY created_at::date
        ORDER BY created_at::date
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const result = {
        periodStart,
        periodEnd,
        facilityId,
        daily: revenue.rows.map(r => ({
          date: r.date,
          total: Number(r.total_minor) / 100,
          paid: Number(r.paid_minor) / 100,
          count: Number(r.invoice_count),
        })),
        totals: {
          total: revenue.rows.reduce((sum, r) => sum + Number(r.total_minor), 0) / 100,
          paid: revenue.rows.reduce((sum, r) => sum + Number(r.paid_minor), 0) / 100,
        },
      };

      await session.query(`
        INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, data, summary, completed_at)
        VALUES ($1,$2,'REVENUE_DAILY',$3,$4,'COMPLETED',$5,$6,now())
      `, [tenantId, facilityId, periodStart, periodEnd, JSON.stringify(result), JSON.stringify(result.totals)]);

      return result;
    });
  }

  async generateOphthalmologyMonthly(tenantId: string, facilityId: string, periodStart: string, periodEnd: string): Promise<any> {
    return this.db.transaction(async (session) => {
      const data = await session.query<{
        category: string;
        count: string;
        severe: string;
      }>(`
        SELECT 
          category,
          COUNT(*)::text as count,
          COUNT(*) FILTER (WHERE severity='SEVERE')::text as severe
        FROM health_ophthalmology.ophthalmic_diagnoses
        WHERE tenant_id=$1 AND encounter_id IN (SELECT id FROM health_clinical.encounters WHERE facility_id=$2)
          AND recorded_at::date BETWEEN $3 AND $4
        GROUP BY category
        ORDER BY COUNT(*) DESC
      `, [tenantId, facilityId, periodStart, periodEnd]);

      const procedures = await session.query<{ procedure_display: string; count: string }>(`
        SELECT procedure_display, COUNT(*)::text as count
        FROM health_ophthalmology.ophthalmic_surgeries
        WHERE tenant_id=$1 AND performed_at::date BETWEEN $2 AND $3
        GROUP BY procedure_display
        ORDER BY COUNT(*) DESC
      `, [tenantId, periodStart, periodEnd]);

      const result = {
        periodStart,
        periodEnd,
        facilityId,
        diseasePatterns: data.rows.map(r => ({ category: r.category, count: Number(r.count), severe: Number(r.severe) })),
        procedures: procedures.rows.map(r => ({ name: r.procedure_display, count: Number(r.count) })),
        totals: { total: data.rows.reduce((sum, r) => sum + Number(r.count), 0) },
      };

      await session.query(`
        INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, data, summary, completed_at)
        VALUES ($1,$2,'OPHTHALMOLOGY_MONTHLY',$3,$4,'COMPLETED',$5,$6,now())
      `, [tenantId, facilityId, periodStart, periodEnd, JSON.stringify(result), JSON.stringify(result.totals)]);

      return result;
    });
  }

  /**
   * Get automatic reporting status for dashboard
   */
  async getAutomaticReportingStatus(tenantId: string, facilityId?: string): Promise<any> {
    return this.db.transaction(async (session) => {
      const params: unknown[] = [tenantId];
      let where = `WHERE tenant_id=$1`;
      if (facilityId) {
        params.push(facilityId);
        where += ` AND facility_id=$${params.length}`;
      }

      const status = await session.query(`
        SELECT * FROM health_reporting.automatic_reporting_status
        ${where}
        ORDER BY facility_name, report_type
      `, params).catch(async () => {
        // Fallback if view doesn't exist yet
        return await session.query(`
          SELECT 
            rs.tenant_id, rs.facility_id, f.name as facility_name, rs.report_type,
            rs.is_active, rs.cron_expression, rs.last_run_at, rs.next_run_at,
            COUNT(agr.id)::int as total_generated,
            MAX(agr.completed_at) as last_generated_at,
            COUNT(CASE WHEN agr.status='FAILED' THEN 1 END)::int as failed_count
          FROM health_reporting.report_schedules rs
          JOIN health_tenant.facilities f ON f.id = rs.facility_id
          LEFT JOIN health_reporting.auto_generated_reports agr ON agr.schedule_id = rs.id
          ${where}
          GROUP BY rs.tenant_id, rs.facility_id, f.name, rs.report_type, rs.is_active, rs.cron_expression, rs.last_run_at, rs.next_run_at
          ORDER BY f.name, rs.report_type
        `, params);
      });

      const recent = await session.query(`
        SELECT report_type, period_start, period_end, status, completed_at, summary
        FROM health_reporting.auto_generated_reports
        WHERE tenant_id=$1 ${facilityId ? `AND facility_id=$2` : ''}
        ORDER BY completed_at DESC
        LIMIT 20
      `, facilityId ? [tenantId, facilityId] : [tenantId]);

      return {
        schedules: status.rows,
        recentReports: recent.rows,
        totalActive: status.rows.filter((r: any) => r.is_active).length,
        totalFailed: status.rows.reduce((sum: number, r: any) => sum + (r.failed_count ?? 0), 0),
      };
    });
  }
}
