import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional } from 'class-validator';
import { GovernanceRepository } from './governance.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('governance')
export class GovernanceController {
  constructor(private readonly gov: GovernanceRepository) {}
  @Get('policies') async policies(@Query('category') category?: string) { return this.gov.policies(getSecurityContext()!, category); }
  @Post('policies') async createPolicy(@Body() body: { code: string; name: string; description?: string; category: string; content: string; effectiveFrom?: string }) { return this.gov.createPolicy(getSecurityContext()!, body); }
  @Get('workflows') async workflows() { return this.gov.workflows(getSecurityContext()!); }
  @Get('approvals') async approvals(@Query('status') status?: string, @Query('resourceType') resourceType?: string) { return this.gov.approvals(getSecurityContext()!, { status, resourceType }); }
  @Post('approvals') async createApproval(@Body() body: { workflowId: string; resourceType: string; resourceId: string; reason: string }) { return this.gov.createApproval(getSecurityContext()!, body); }
  @Post('approvals/:id/decide') async decide(@Param('id') id: string, @Body() body: { decision: 'APPROVED' | 'REJECTED'; notes?: string }) { return this.gov.decideApproval(getSecurityContext()!, id, body.decision, body.notes); }
  @Get('quality') async quality() { return this.gov.qualityIndicators(getSecurityContext()!); }
}
