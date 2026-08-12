import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';
import { ReportSchedulerService } from './report-scheduler.service';
import { getSecurityContext } from '../../core/request-context';

class GenerateReportDto {
  @IsString() facilityId!: string;
  @IsString() reportType!: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
}

class GenerateMTUHA2Dto {
  @IsString() facilityId!: string;
  @IsNumber() year!: number;
  @IsNumber() month!: number;
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('reports')
export class ReportingController {
  constructor(
    private readonly reporting: ReportingRepository,
    private readonly reportingService: ReportingService,
    private readonly scheduler: ReportSchedulerService,
  ) {}

  @Get('executive') @RequirePermissions({ resource: 'reports', action: 'READ' }) async executive() { return this.reporting.executiveDashboard(getSecurityContext()!); }
  @Get('clinical') @RequirePermissions({ resource: 'reports', action: 'READ' }) async clinical() { return this.reporting.clinicalMetrics(getSecurityContext()!); }
  @Get('operational') @RequirePermissions({ resource: 'reports', action: 'READ' }) async operational() { return this.reporting.operationalMetrics(getSecurityContext()!); }
  @Get('mtuha') @RequirePermissions({ resource: 'reports', action: 'READ' }) async mtuha(@Query('facilityId') facilityId?: string) { return this.reporting.mtuhaReports(getSecurityContext()!, facilityId); }
  @Post('mtuha') @RequirePermissions({ resource: 'reports', action: 'READ' }) async createMtuha(@Body() body: { facilityId: string; reportType: string; periodStart: string; periodEnd: string; data: any }) { return this.reporting.createMtuhaReport(getSecurityContext()!, body); }
  @Get('definitions') @RequirePermissions({ resource: 'reports', action: 'READ' }) async definitions() { return this.reporting.reportDefinitions(getSecurityContext()!); }

  // Automatic report generation endpoints

  @Post('mtuha/book6/generate')
  @ApiOperation({ summary: 'Auto-generate MTUHA Book 6 - Outpatient Register', description: 'Automatically generates Book 6 from OPD encounters grouped by age/gender/diagnosis for MOH compliance' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async generateBook6(@Body() dto: GenerateReportDto) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.reportingService.generateBook6(tenantId, dto.facilityId, dto.periodStart, dto.periodEnd);
  }

  @Post('mtuha/book8/generate')
  @ApiOperation({ summary: 'Auto-generate MTUHA Book 8 - Inpatient Register' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async generateBook8(@Body() dto: GenerateReportDto) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.reportingService.generateBook8(tenantId, dto.facilityId, dto.periodStart, dto.periodEnd);
  }

  @Post('mtuha/mtuha2/generate')
  @ApiOperation({ summary: 'Auto-generate MTUHA 2 - Monthly Summary for MOH', description: 'Monthly summary including OPD/IPD under5/over5, deliveries, malaria/pneumonia/diarrhea, ophthalmology cataract/glaucoma/DR' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async generateMTUHA2(@Body() dto: GenerateMTUHA2Dto) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.reportingService.generateMTUHA2(tenantId, dto.facilityId, dto.year, dto.month);
  }

  @Post('auto/generate')
  @ApiOperation({ summary: 'Auto-generate specified report type', description: 'Trigger manual auto-generation for BOOK6, BOOK8, MTUHA2, REVENUE_DAILY, OPHTHALMOLOGY_MONTHLY, or ALL' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async autoGenerate(@Body() dto: GenerateReportDto) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.scheduler.triggerManualGeneration(tenantId, dto.facilityId, dto.reportType, dto.periodStart, dto.periodEnd);
  }

  @Post('auto/generate-all')
  @ApiOperation({ summary: 'Auto-generate all reports for facility and period' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async generateAll(@Body() dto: { facilityId: string; periodStart: string; periodEnd: string }) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.reportingService.generateAllReports(tenantId, dto.facilityId, dto.periodStart, dto.periodEnd);
  }

  @Get('auto/status')
  @ApiOperation({ summary: 'Get automatic reporting scheduler status', description: 'Shows active schedules, last run, next run, total generated, failed counts per facility and report type' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async autoStatus(@Query('facilityId') facilityId?: string) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    return this.reportingService.getAutomaticReportingStatus(tenantId, facilityId);
  }

  @Get('auto/recent')
  @ApiOperation({ summary: 'Get recent auto-generated reports' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async recentAuto(@Query('facilityId') facilityId?: string, @Query('limit') limit?: string) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    // Use status method which includes recent
    const status = await this.reportingService.getAutomaticReportingStatus(tenantId, facilityId);
    return status.recentReports.slice(0, limit ? Number(limit) : 20);
  }

  @Get('auto/schedules')
  @ApiOperation({ summary: 'List automatic report schedules' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async schedules(@Query('facilityId') facilityId?: string) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    const status = await this.reportingService.getAutomaticReportingStatus(tenantId, facilityId);
    return status.schedules;
  }

  @Get('revenue/daily')
  @ApiOperation({ summary: 'Auto-generated revenue daily breakdown' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async revenueDaily(@Query('facilityId') facilityId?: string, @Query('periodStart') periodStart?: string, @Query('periodEnd') periodEnd?: string) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    const fid = facilityId ?? '00000000-0000-0000-0000-000000000010';
    const start = periodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = periodEnd ?? new Date().toISOString().slice(0, 10);
    return this.reportingService.generateRevenueDaily(tenantId, fid, start, end);
  }

  @Get('ophthalmology/monthly')
  @ApiOperation({ summary: 'Auto-generated ophthalmology monthly disease patterns and procedures' })
  @RequirePermissions({ resource: 'reports', action: 'READ' })
  async ophthalmologyMonthly(@Query('facilityId') facilityId?: string, @Query('periodStart') periodStart?: string, @Query('periodEnd') periodEnd?: string) {
    const ctx = getSecurityContext()!;
    const tenantId = ctx.activeTenantId ?? ctx.tenantId!;
    const fid = facilityId ?? '00000000-0000-0000-0000-000000000010';
    const start = periodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = periodEnd ?? new Date().toISOString().slice(0, 10);
    return this.reportingService.generateOphthalmologyMonthly(tenantId, fid, start, end);
  }
}
