import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { OrganizationRepository } from './organization.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly org: OrganizationRepository) {}
  @Get(':tenantId/hierarchy') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async hierarchy(@Param('tenantId') tenantId: string) { return this.org.hierarchy(getSecurityContext()!, tenantId); }
  @Get('facilities/:facilityId/rooms') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async rooms(@Param('facilityId') facilityId: string) { return this.org.rooms(getSecurityContext()!, facilityId); }
  @Post('facilities/:facilityId/rooms') @RequirePermissions({ resource: 'tenant', action: 'MANAGE' }) async createRoom(@Param('facilityId') facilityId: string, @Body() body: { name: string; roomType: string; departmentId?: string; capacity?: number }) { return this.org.createRoom(getSecurityContext()!, facilityId, body); }
  @Get('facilities/:facilityId/beds') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async beds(@Param('facilityId') facilityId: string) { return this.org.beds(getSecurityContext()!, facilityId); }
  @Get('facilities/:facilityId/equipment') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async equipment(@Param('facilityId') facilityId: string) { return this.org.equipment(getSecurityContext()!, facilityId); }
  @Post('facilities/:facilityId/equipment') @RequirePermissions({ resource: 'tenant', action: 'MANAGE' }) async createEquipment(@Param('facilityId') facilityId: string, @Body() body: { name: string; model?: string; manufacturer?: string; serialNumber?: string; category?: string; location?: string }) { return this.org.createEquipment(getSecurityContext()!, facilityId, body); }
}
