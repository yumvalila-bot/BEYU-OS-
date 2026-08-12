import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DATABASE } from '../../core/database.token';
import { Inject } from '@nestjs/common';
import type { Database } from '../../db/driver';
import { type ReportingService } from './reporting.service';

/**
 * BEYU HEALTH OS — Automatic Report Scheduler
 * Generates MTUHA and operational reports automatically per schedule
 * Timezone: Africa/Dar_es_Salaam (Tanzania)
 * Spec §26 Reporting and Analytics, Tanzania MTUHA
 */

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly reportingService: ReportingService,
  ) {}

  /**
   * Daily at 1 AM - Generate daily patient volume and revenue reports for previous day
   * Cron: 0 1 * * * (Africa/Dar_es_Salaam)
   */
  @Cron('0 1 * * *', { name: 'daily-reports', timeZone: 'Africa/Dar_es_Salaam' })
  async handleDailyReports() {
    this.logger.log('Starting daily automatic reports generation');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const periodStart = yesterday.toISOString().slice(0, 10);
    const periodEnd = periodStart;

    try {
      const facilities = await this.getActiveFacilities();
      for (const facility of facilities) {
        try {
          await this.reportingService.generateBook6(facility.tenant_id, facility.id, periodStart, periodEnd);
          await this.reportingService.generateRevenueDaily(facility.tenant_id, facility.id, periodStart, periodEnd);
          await this.updateScheduleLastRun(facility.tenant_id, facility.id, 'BOOK6');
          await this.updateScheduleLastRun(facility.tenant_id, facility.id, 'REVENUE_DAILY');
          this.logger.log(`Daily reports generated for facility ${facility.name} (${facility.id})`);
        } catch (e) {
          this.logger.error(`Failed daily reports for facility ${facility.id}: ${(e as Error).message}`);
          await this.logFailure(facility.tenant_id, facility.id, 'DAILY', (e as Error).message);
        }
      }
    } catch (e) {
      this.logger.error(`Daily reports scheduler failed: ${(e as Error).message}`);
    }
  }

  /**
   * Daily at 2 AM - Generate Book 6 (Outpatient) and Revenue for previous day
   */
  @Cron('0 2 * * *', { name: 'book6-daily', timeZone: 'Africa/Dar_es_Salaam' })
  async handleBook6Daily() {
    // Already covered in daily, but separate for granularity and retry
    this.logger.debug('Book 6 daily already handled in daily-reports');
  }

  /**
   * Monthly on 1st at 3 AM - Generate MTUHA 2 monthly summary for previous month
   * Cron: 0 3 1 * * (Africa/Dar_es_Salaam)
   */
  @Cron('0 3 1 * *', { name: 'mtuha2-monthly', timeZone: 'Africa/Dar_es_Salaam' })
  async handleMTUHA2Monthly() {
    this.logger.log('Starting MTUHA 2 monthly automatic generation');
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevMonth.getFullYear();
    const month = prevMonth.getMonth() + 1;

    try {
      const facilities = await this.getActiveFacilities();
      for (const facility of facilities) {
        try {
          await this.reportingService.generateMTUHA2(facility.tenant_id, facility.id, year, month);
          await this.updateScheduleLastRun(facility.tenant_id, facility.id, 'MTUHA2');
          this.logger.log(`MTUHA 2 generated for ${facility.name} ${year}-${month}`);
        } catch (e) {
          this.logger.error(`MTUHA 2 failed for facility ${facility.id}: ${(e as Error).message}`);
          await this.logFailure(facility.tenant_id, facility.id, 'MTUHA2', (e as Error).message);
        }
      }
    } catch (e) {
      this.logger.error(`MTUHA 2 monthly scheduler failed: ${(e as Error).message}`);
    }
  }

  /**
   * Monthly on 1st at 4 AM - Generate Ophthalmology monthly report
   */
  @Cron('0 4 1 * *', { name: 'ophthalmology-monthly', timeZone: 'Africa/Dar_es_Salaam' })
  async handleOphthalmologyMonthly() {
    this.logger.log('Starting Ophthalmology monthly report generation');
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = prevMonth.toISOString().slice(0, 10);
    const periodEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

    try {
      const facilities = await this.getActiveFacilities();
      for (const facility of facilities) {
        try {
          await this.reportingService.generateOphthalmologyMonthly(facility.tenant_id, facility.id, periodStart, periodEnd);
          await this.updateScheduleLastRun(facility.tenant_id, facility.id, 'OPHTHALMOLOGY_MONTHLY');
          this.logger.log(`Ophthalmology monthly generated for ${facility.name}`);
        } catch (e) {
          this.logger.error(`Ophthalmology monthly failed for ${facility.id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.error(`Ophthalmology monthly scheduler failed: ${(e as Error).message}`);
    }
  }

  /**
   * Weekly on Monday at 2 AM - Generate weekly summaries
   */
  @Cron('0 2 * * 1', { name: 'weekly-summary', timeZone: 'Africa/Dar_es_Salaam' })
  async handleWeeklySummary() {
    this.logger.log('Starting weekly summary generation');
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - 7);
    const periodStart = lastMonday.toISOString().slice(0, 10);
    const periodEnd = today.toISOString().slice(0, 10);

    try {
      const facilities = await this.getActiveFacilities();
      for (const facility of facilities) {
        try {
          await this.reportingService.generateAllReports(facility.tenant_id, facility.id, periodStart, periodEnd);
          this.logger.log(`Weekly reports generated for ${facility.name}`);
        } catch (e) {
          this.logger.error(`Weekly reports failed for ${facility.id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.error(`Weekly scheduler failed: ${(e as Error).message}`);
    }
  }

  /**
   * Heartbeat every hour to update next_run_at based on cron expressions
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'update-next-run' })
  async updateNextRunTimes() {
    try {
      await this.db.query(`
        UPDATE health_reporting.report_schedules
        SET next_run_at = CASE
          WHEN cron_expression = '0 1 * * *' THEN now() + interval '1 day'
          WHEN cron_expression = '0 2 * * *' THEN now() + interval '1 day'
          WHEN cron_expression = '0 3 1 * *' THEN date_trunc('month', now()) + interval '1 month' + interval '3 hours'
          WHEN cron_expression = '0 4 1 * *' THEN date_trunc('month', now()) + interval '1 month' + interval '4 hours'
          ELSE now() + interval '1 day'
        END,
        updated_at = now()
        WHERE is_active = true AND (next_run_at IS NULL OR next_run_at < now())
      `);
      this.logger.debug('Updated next_run_at for active schedules');
    } catch (e) {
      this.logger.error(`Failed to update next_run_at: ${(e as Error).message}`);
    }
  }

  /**
   * Manual trigger for immediate generation (used by API endpoint)
   */
  async triggerManualGeneration(tenantId: string, facilityId: string, reportType: string, periodStart: string, periodEnd: string): Promise<any> {
    this.logger.log(`Manual trigger: ${reportType} for facility ${facilityId} ${periodStart} to ${periodEnd}`);

    switch (reportType) {
      case 'BOOK6':
        return this.reportingService.generateBook6(tenantId, facilityId, periodStart, periodEnd);
      case 'BOOK8':
        return this.reportingService.generateBook8(tenantId, facilityId, periodStart, periodEnd);
      case 'MTUHA2':
        const startDate = new Date(periodStart);
        return this.reportingService.generateMTUHA2(tenantId, facilityId, startDate.getFullYear(), startDate.getMonth() + 1);
      case 'REVENUE_DAILY':
        return this.reportingService.generateRevenueDaily(tenantId, facilityId, periodStart, periodEnd);
      case 'OPHTHALMOLOGY_MONTHLY':
        return this.reportingService.generateOphthalmologyMonthly(tenantId, facilityId, periodStart, periodEnd);
      case 'ALL':
        return this.reportingService.generateAllReports(tenantId, facilityId, periodStart, periodEnd);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private async getActiveFacilities(): Promise<Array<{ id: string; tenant_id: string; name: string }>> {
    const result = await this.db.query<{ id: string; tenant_id: string; name: string }>(`
      SELECT f.id, f.tenant_id, f.name
      FROM health_tenant.facilities f
      WHERE f.status='ACTIVE' AND f.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM health_reporting.report_schedules rs WHERE rs.facility_id=f.id AND rs.is_active=true)
    `);
    if (result.rows.length === 0) {
      // Fallback: all active facilities if no schedules configured
      const fallback = await this.db.query<{ id: string; tenant_id: string; name: string }>(`
        SELECT id, tenant_id, name FROM health_tenant.facilities WHERE status='ACTIVE' AND deleted_at IS NULL LIMIT 10
      `);
      return fallback.rows;
    }
    return result.rows;
  }

  private async updateScheduleLastRun(tenantId: string, facilityId: string, reportType: string): Promise<void> {
    await this.db.query(`
      UPDATE health_reporting.report_schedules
      SET last_run_at=now(), updated_at=now()
      WHERE tenant_id=$1 AND facility_id=$2 AND report_type=$3
    `, [tenantId, facilityId, reportType]).catch(() => {});
  }

  private async logFailure(tenantId: string, facilityId: string, reportType: string, errorMessage: string): Promise<void> {
    await this.db.query(`
      INSERT INTO health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start, period_end, status, error_message, generated_by)
      VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,'FAILED',$4,'SYSTEM')
    `, [tenantId, facilityId, reportType, errorMessage]).catch(() => {});
  }
}
