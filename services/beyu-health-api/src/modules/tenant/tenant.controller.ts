import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { TenantRepository } from './tenant.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateTenantDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() parentTenantId?: string;
  @IsOptional() @IsObject() settings?: any;
}
class CreateFacilityDto {
  @IsString() name!: string;
  @IsString() type!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}
class CreateDepartmentDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() specialty?: string;
}

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenants: TenantRepository) {}
  @Get() @RequirePermissions({ resource: 'tenant', action: 'READ' }) async list() { return this.tenants.list(getSecurityContext()!); }
  @Get(':id') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async get(@Param('id') id: string) { return this.tenants.findById(getSecurityContext()!, id); }
  @Get(':id/stats') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async stats(@Param('id') id: string) { return this.tenants.stats(getSecurityContext()!, id); }
  @Get(':id/facilities') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async facilities(@Param('id') id: string) { return this.tenants.facilities(getSecurityContext()!, id); }
  @Post() @RequirePermissions({ resource: 'tenant', action: 'MANAGE' }) async create(@Body() dto: CreateTenantDto) { return this.tenants.create(getSecurityContext()!, dto); }
  @Post(':id/facilities') @RequirePermissions({ resource: 'tenant', action: 'MANAGE' }) async createFacility(@Param('id') id: string, @Body() dto: CreateFacilityDto) { return this.tenants.createFacility(getSecurityContext()!, id, dto); }
  @Get('facilities/:facilityId/departments') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async departments(@Param('facilityId') facilityId: string) { return this.tenants.departments(getSecurityContext()!, facilityId); }
  @Post('facilities/:facilityId/departments') @RequirePermissions({ resource: 'tenant', action: 'MANAGE' }) async createDepartment(@Param('facilityId') facilityId: string, @Body() dto: CreateDepartmentDto) { return this.tenants.createDepartment(getSecurityContext()!, facilityId, dto); }
}
