import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { GovernanceRepository } from './governance.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('governance')
export class GovernanceController {
  constructor(private readonly gov: GovernanceRepository) {}
  @Get('policies') async policies() { return this.gov.policies(getSecurityContext()!); }
  @Get('approvals') async approvals(@Query('status') status?: string) { return this.gov.approvals(getSecurityContext()!, status); }
  @Get('quality') async quality() { return this.gov.qualityIndicators(getSecurityContext()!); }
}
