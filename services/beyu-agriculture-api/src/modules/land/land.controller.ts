import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { LandRepository } from './land.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateFieldDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() farmId!: string;
  @IsString() name!: string;
  @IsIn(['CROPLAND', 'PASTURE', 'FALLOW', 'FORESTRY', 'INFRASTRUCTURE', 'BUFFER']) fieldUse!: string;
  @IsNumber() @Min(0.01) areaHa!: number;
  @IsOptional() @IsIn(['SAND', 'LOAMY_SAND', 'SANDY_LOAM', 'LOAM', 'SILT_LOAM', 'CLAY_LOAM', 'CLAY', 'VOLCANIC', 'ALLUVIAL']) soilTexture?: string;
  @IsOptional() @IsString() irrigationType?: string;
  @IsOptional() boundary?: unknown;
}

class CreateSoilRecordDto {
  @IsString() fieldId!: string;
  @IsDateString() sampledOn!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(14) ph?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) organicMatterPct?: number;
  @IsOptional() @IsNumber() @Min(0) nitrogenPPM?: number;
  @IsOptional() @IsNumber() @Min(0) phosphorusPPM?: number;
  @IsOptional() @IsNumber() @Min(0) potassiumPPM?: number;
  @IsOptional() @IsString() notes?: string;
}

class CreateWeatherDto {
  @IsString() farmId!: string;
  @IsDateString() observedOn!: string;
  @IsOptional() @IsNumber() temperatureC?: number;
  @IsOptional() @IsNumber() @Min(0) rainfallMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) humidityPct?: number;
  @IsOptional() @IsNumber() @Min(0) windKph?: number;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('land')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class LandController {
  constructor(private readonly land: LandRepository) {}

  // Fields
  @Get('fields')
  @RequirePermissions({ resource: 'field', action: 'SEARCH' })
  async listFields(@Query('q') q?: string, @Query('farmId') farmId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('status') status?: string) {
    const ctx = getSecurityContext()!;
    return this.land.listFields(ctx, { q, farmId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined, status });
  }

  @Get('fields/:id')
  @RequirePermissions({ resource: 'field', action: 'READ' })
  async getField(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.land.findFieldById(ctx, id);
  }

  @Post('fields')
  @RequirePermissions({ resource: 'field', action: 'CREATE' })
  async createField(@Body() dto: CreateFieldDto) {
    const ctx = getSecurityContext()!;
    return this.land.createField(ctx, dto);
  }

  @Put('fields/:id')
  @RequirePermissions({ resource: 'field', action: 'UPDATE' })
  async updateField(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.land.updateField(ctx, id, body);
  }

  @Delete('fields/:id')
  @RequirePermissions({ resource: 'field', action: 'DELETE' })
  async deleteField(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    await this.land.deleteField(ctx, id);
    return { success: true };
  }

  // Soil
  @Get('soil-records')
  @RequirePermissions({ resource: 'soil_record', action: 'SEARCH' })
  async listSoil(@Query('fieldId') fieldId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.land.listSoilRecords(ctx, { fieldId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('soil-records')
  @RequirePermissions({ resource: 'soil_record', action: 'CREATE' })
  async createSoil(@Body() dto: CreateSoilRecordDto) {
    const ctx = getSecurityContext()!;
    return this.land.createSoilRecord(ctx, dto);
  }

  // Weather
  @Get('weather')
  @RequirePermissions({ resource: 'weather_observation', action: 'SEARCH' })
  async listWeather(@Query('farmId') farmId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.land.listWeather(ctx, { farmId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('weather')
  @RequirePermissions({ resource: 'weather_observation', action: 'CREATE' })
  async createWeather(@Body() dto: CreateWeatherDto) {
    const ctx = getSecurityContext()!;
    return this.land.createWeather(ctx, dto);
  }
}
