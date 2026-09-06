import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { CropRepository } from './crop.repository';
import { getSecurityContext } from '../../core/request-context';

const ACTIVITY_TYPES = ['LAND_PREPARATION', 'PLANTING', 'IRRIGATION', 'FERTILIZATION', 'PEST_CONTROL', 'DISEASE_CONTROL', 'WEEDING', 'PRUNING', 'THINNING', 'SCOUTING', 'SOIL_SAMPLING', 'HARVESTING', 'POST_HARVEST_HANDLING', 'MAINTENANCE', 'OTHER'];
const CYCLE_STATUSES = ['PLANNED', 'PLANTED', 'GROWING', 'HARVESTED', 'TERMINATED'];

class CreateCropDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() scientificName?: string;
  @IsIn(['CEREAL', 'LEGUME', 'ROOT_TUBER', 'VEGETABLE', 'FRUIT', 'NUT', 'OILSEED', 'FIBER', 'SPICE', 'FORAGE', 'FORESTRY']) category!: string;
  @IsOptional() @IsNumber() @Min(1) growingDaysMin?: number;
  @IsOptional() @IsNumber() @Min(1) growingDaysMax?: number;
}

class CreateCropCycleDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() fieldId!: string;
  @IsString() cropId!: string;
  @IsString() seasonCode!: string;
  @IsOptional() @IsDateString() plantedOn?: string;
  @IsOptional() @IsDateString() expectedHarvestOn?: string;
  @IsOptional() @IsNumber() @Min(0.01) areaPlantedHa?: number;
  @IsOptional() @IsNumber() @Min(0) seedRateKgPerHa?: number;
  @IsOptional() @IsNumber() @Min(0) targetYieldTonsPerHa?: number;
}

class CreateActivityDto {
  @IsString() fieldId!: string;
  @IsOptional() @IsString() cropCycleId?: string;
  @IsIn(ACTIVITY_TYPES) activityType!: string;
  @IsOptional() @IsDateString() scheduledOn?: string;
  @IsOptional() @IsDateString() performedOn?: string;
  @IsOptional() @IsNumber() @Min(0) costAmount?: number;
  @IsOptional() @IsString() costCurrency?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateHarvestDto {
  @IsString() cropCycleId!: string;
  @IsDateString() harvestedOn!: string;
  @IsNumber() @Min(0.01) quantityKg!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) moisturePct?: number;
  @IsOptional() @IsIn(['A', 'B', 'C', 'REJECTED']) qualityGrade?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateStorageLotDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() harvestId?: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() cropId?: string;
  @IsNumber() @Min(0.01) quantityKg!: number;
}

@ApiTags('crops')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class CropController {
  constructor(private readonly crops: CropRepository) {}

  @Get('crops')
  @RequirePermissions({ resource: 'crop', action: 'SEARCH' })
  async listCrops(@Query('q') q?: string, @Query('category') category?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.crops.listCrops(ctx, { q, category, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('crops')
  @RequirePermissions({ resource: 'crop', action: 'CREATE' })
  async createCrop(@Body() dto: CreateCropDto) {
    const ctx = getSecurityContext()!;
    return this.crops.createCrop(ctx, dto);
  }

  @Get('crop-cycles')
  @RequirePermissions({ resource: 'crop_cycle', action: 'SEARCH' })
  async listCycles(@Query('fieldId') fieldId?: string, @Query('cropId') cropId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.crops.listCropCycles(ctx, { fieldId, cropId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Get('crop-cycles/:id')
  @RequirePermissions({ resource: 'crop_cycle', action: 'READ' })
  async getCycle(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.crops.findCropCycleById(ctx, id);
  }

  @Post('crop-cycles')
  @RequirePermissions({ resource: 'crop_cycle', action: 'CREATE' })
  async createCycle(@Body() dto: CreateCropCycleDto) {
    const ctx = getSecurityContext()!;
    return this.crops.createCropCycle(ctx, dto);
  }

  @Put('crop-cycles/:id')
  @RequirePermissions({ resource: 'crop_cycle', action: 'UPDATE' })
  async updateCycle(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.crops.updateCropCycle(ctx, id, body);
  }

  @Get('activities')
  @RequirePermissions({ resource: 'field_activity', action: 'SEARCH' })
  async listActivities(@Query('fieldId') fieldId?: string, @Query('cropCycleId') cropCycleId?: string, @Query('activityType') activityType?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.crops.listActivities(ctx, { fieldId, cropCycleId, activityType, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('activities')
  @RequirePermissions({ resource: 'field_activity', action: 'CREATE' })
  async createActivity(@Body() dto: CreateActivityDto) {
    const ctx = getSecurityContext()!;
    return this.crops.createActivity(ctx, dto);
  }

  @Post('activities/:id/complete')
  @HttpCode(200)
  @RequirePermissions({ resource: 'field_activity', action: 'UPDATE' })
  async completeActivity(@Param('id') id: string, @Body() body: { performedOn?: string; notes?: string; costAmount?: number; costCurrency?: string }) {
    const ctx = getSecurityContext()!;
    return this.crops.completeActivity(ctx, id, body);
  }

  @Get('harvests')
  @RequirePermissions({ resource: 'harvest', action: 'SEARCH' })
  async listHarvests(@Query('cropCycleId') cropCycleId?: string, @Query('fieldId') fieldId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.crops.listHarvests(ctx, { cropCycleId, fieldId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('harvests')
  @RequirePermissions({ resource: 'harvest', action: 'CREATE' })
  async createHarvest(@Body() dto: CreateHarvestDto) {
    const ctx = getSecurityContext()!;
    return this.crops.createHarvest(ctx, dto);
  }

  @Get('storage-lots')
  @RequirePermissions({ resource: 'storage_lot', action: 'SEARCH' })
  async listStorageLots(@Query('warehouseId') warehouseId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.crops.listStorageLots(ctx, { warehouseId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('storage-lots')
  @RequirePermissions({ resource: 'storage_lot', action: 'CREATE' })
  async createStorageLot(@Body() dto: CreateStorageLotDto) {
    const ctx = getSecurityContext()!;
    return this.crops.createStorageLot(ctx, dto);
  }

  @Post('storage-lots/:id/release')
  @HttpCode(200)
  @RequirePermissions({ resource: 'storage_lot', action: 'UPDATE' })
  async releaseStorageLot(@Param('id') id: string, @Body() body: { quantityKg: number }) {
    const ctx = getSecurityContext()!;
    return this.crops.releaseStorageLot(ctx, id, body.quantityKg);
  }
}

export { ACTIVITY_TYPES, CYCLE_STATUSES };
