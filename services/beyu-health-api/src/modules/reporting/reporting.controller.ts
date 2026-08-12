import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
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
}
