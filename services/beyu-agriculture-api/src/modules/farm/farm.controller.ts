import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { FarmRepository } from './farm.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateFarmDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() name!: string;
  @IsIn(['CROP_FARM', 'LIVESTOCK_FARM', 'MIXED_FARM', 'ORCHARD', 'NURSERY', 'AQUACULTURE', 'RESEARCH_STATION']) farmType!: string;
  @IsString() countryCode!: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) gpsLatitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) gpsLongitude?: number;
  @IsOptional() @IsNumber() @Min(0) totalAreaHa?: number;
  @IsOptional() @IsIn(['FREEHOLD', 'LEASEHOLD', 'COMMUNAL', 'CONTRACT_FARMING', 'RENTED']) tenure?: string;
}

@ApiTags('farms')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('farms')
export class FarmController {
  constructor(private readonly farms: FarmRepository) {}

  @Get()
  @RequirePermissions({ resource: 'farm', action: 'SEARCH' })
  async list(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('status') status?: string, @Query('farmType') farmType?: string) {
    const ctx = getSecurityContext()!;
    return this.farms.list(ctx, { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined, status, farmType });
  }

  @Get(':id')
  @RequirePermissions({ resource: 'farm', action: 'READ' })
  async get(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.farms.findById(ctx, id);
  }

  @Post()
  @RequirePermissions({ resource: 'farm', action: 'CREATE' })
  async create(@Body() dto: CreateFarmDto) {
    const ctx = getSecurityContext()!;
    return this.farms.create(ctx, { ...dto, tenantId: dto.tenantId ?? ctx.activeTenantId ?? ctx.tenantId! });
  }

  @Put(':id')
  @RequirePermissions({ resource: 'farm', action: 'UPDATE' })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.farms.update(ctx, id, body);
  }

  @Delete(':id')
  @RequirePermissions({ resource: 'farm', action: 'DELETE' })
  async remove(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    await this.farms.softDelete(ctx, id);
    return { success: true };
  }
}
