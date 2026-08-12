import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { ComplianceRepository } from './compliance.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceRepository) {}
  @Get('packs') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async packs() { return this.compliance.packs(getSecurityContext()!); }
  @Get('evidence/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async evidence(@Param('tenantId') tenantId: string) { return this.compliance.evidence(getSecurityContext()!, tenantId); }
  @Get('incidents/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async incidents(@Param('tenantId') tenantId: string) { return this.compliance.incidents(getSecurityContext()!, tenantId); }
  @Get('dashboard/:tenantId') @RequirePermissions({ resource: 'compliance', action: 'READ' }) async dashboard(@Param('tenantId') tenantId: string) { return this.compliance.dashboard(getSecurityContext()!, tenantId); }
}
