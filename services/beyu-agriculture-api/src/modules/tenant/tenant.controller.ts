import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { TenantRepository } from './tenant.repository';
import { getSecurityContext } from '../../core/request-context';

const TENANT_TYPES = ['AGRIBUSINESS_GROUP', 'COMMERCIAL_FARM', 'COOPERATIVE', 'SMALLHOLDER_ASSOCIATION', 'CONTRACT_FARMING_SCHEME', 'PROCESSING_COMPANY', 'EXPORTER', 'RESEARCH_INSTITUTE'];

class CreateTenantDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsIn(TENANT_TYPES) type!: string;
  @IsString() countryCode!: string;
  @IsOptional() @IsString() parentTenantId?: string;
}
const TENANT_STATUSES = ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'CLOSED'];

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenants: TenantRepository) {}

  @Get()
  @RequirePermissions({ resource: 'tenant', action: 'SEARCH' })
  async list(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('status') status?: string) {
    const ctx = getSecurityContext()!;
    return this.tenants.list(ctx, { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined, status });
  }

  @Get(':id')
  @RequirePermissions({ resource: 'tenant', action: 'READ' })
  async get(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.tenants.findById(ctx, id);
  }

  @Post()
  @RequirePermissions({ resource: 'tenant', action: 'CREATE' })
  async create(@Body() dto: CreateTenantDto) {
    const ctx = getSecurityContext()!;
    return this.tenants.create(ctx, dto);
  }

  @Put(':id')
  @RequirePermissions({ resource: 'tenant', action: 'UPDATE' })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.tenants.update(ctx, id, body);
  }
}
export { TENANT_TYPES, TENANT_STATUSES };
