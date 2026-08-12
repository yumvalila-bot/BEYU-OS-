import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { ReportingRepository } from './reporting.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingRepository) {}
  @Get('executive') @RequirePermissions({ resource: 'reports', action: 'READ' }) async executive() { return this.reporting.executiveDashboard(getSecurityContext()!); }
  @Get('clinical') @RequirePermissions({ resource: 'reports', action: 'READ' }) async clinical() { return this.reporting.clinicalMetrics(getSecurityContext()!); }
  @Get('operational') @RequirePermissions({ resource: 'reports', action: 'READ' }) async operational() { return this.reporting.operationalMetrics(getSecurityContext()!); }
  @Get('mtuha') @RequirePermissions({ resource: 'reports', action: 'READ' }) async mtuha(@Query('facilityId') facilityId?: string) { return this.reporting.mtuhaReports(getSecurityContext()!, facilityId); }
  @Post('mtuha') @RequirePermissions({ resource: 'reports', action: 'READ' }) async createMtuha(@Body() body: { facilityId: string; reportType: string; periodStart: string; periodEnd: string; data: any }) { return this.reporting.createMtuhaReport(getSecurityContext()!, body); }
  @Get('definitions') @RequirePermissions({ resource: 'reports', action: 'READ' }) async definitions() { return this.reporting.reportDefinitions(getSecurityContext()!); }
}
