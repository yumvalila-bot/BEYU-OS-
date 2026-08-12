import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional } from 'class-validator';
import { ComplianceRepository } from './compliance.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceRepository) {}
  @Get('packs') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async packs() { return this.compliance.packs(getSecurityContext()!); }
  @Get('packs/:id/requirements') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async requirements(@Param('id') id: string) { return this.compliance.requirements(getSecurityContext()!, id); }
  @Get('evidence/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async evidence(@Param('tenantId') tenantId: string) { return this.compliance.evidence(getSecurityContext()!, tenantId); }
  @Post('evidence') @RequirePermissions({ resource: 'compliance', action: 'MANAGE' }) async createEvidence(@Body() body: { tenantId: string; facilityId?: string; requirementId: string; status: string; evidenceText?: string; evidenceUrl?: string; expiryDate?: string }) { return this.compliance.createEvidence(getSecurityContext()!, body); }
  @Get('incidents/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async incidents(@Param('tenantId') tenantId: string, @Query('type') type?: string, @Query('severity') severity?: string, @Query('status') status?: string) { return this.compliance.incidents(getSecurityContext()!, tenantId, { type, severity, status }); }
  @Post('incidents') @RequirePermissions({ resource: 'compliance', action: 'MANAGE' }) async createIncident(@Body() body: { tenantId: string; facilityId?: string; type: string; severity: string; title: string; description: string; patientId?: string; location?: string; correctiveAction?: string }) { return this.compliance.createIncident(getSecurityContext()!, body); }
  @Get('dashboard/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async dashboard(@Param('tenantId') tenantId: string) { return this.compliance.dashboard(getSecurityContext()!, tenantId); }
}
