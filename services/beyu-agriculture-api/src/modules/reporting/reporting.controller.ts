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

  @Get('tenant-stats')
  @RequirePermissions({ resource: 'report', action: 'READ' })
  async tenantStats() {
    const ctx = getSecurityContext()!;
    return this.reporting.tenantStats(ctx);
  }
}
