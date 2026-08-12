import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { OrganizationRepository } from './organization.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly org: OrganizationRepository) {}
  @Get(':tenantId/hierarchy') async hierarchy(@Param('tenantId') tenantId: string) { return this.org.hierarchy(getSecurityContext()!, tenantId); }
}
