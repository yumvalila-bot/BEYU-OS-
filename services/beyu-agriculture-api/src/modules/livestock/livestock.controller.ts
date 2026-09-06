import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { LivestockRepository } from './livestock.repository';
import { getSecurityContext } from '../../core/request-context';

const SPECIES = ['CATTLE', 'GOAT', 'SHEEP', 'PIG', 'POULTRY', 'RABBIT', 'DONKEY', 'BEE', 'FISH'];
const PRODUCTION_TYPES = ['MILK', 'EGGS', 'WOOL', 'HONEY', 'MEAT', 'OFFSPRING', 'FISH_HARVEST'];

class CreateHerdDto {
  @IsString() farmId!: string;
  @IsString() name!: string;
  @IsIn(SPECIES) species!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateAnimalDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() herdId?: string;
  @IsString() tagNumber!: string;
  @IsIn(SPECIES) species!: string;
  @IsOptional() @IsString() breed?: string;
  @IsIn(['MALE', 'FEMALE']) sex!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsDateString() acquisitionDate?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateHealthEventDto {
  @IsString() animalId!: string;
  @IsIn(['VACCINATION', 'TREATMENT', 'ILLNESS', 'INJURY', 'CHECKUP', 'DEWORMING', 'QUARANTINE']) eventType!: string;
  @IsDateString() eventDate!: string;
  @IsOptional() @IsString() veterinarian?: string;
  @IsOptional() @IsString() treatment?: string;
  @IsOptional() @IsNumber() @Min(0) withdrawalDays?: number;
  @IsOptional() @IsNumber() @Min(0) costAmount?: number;
  @IsOptional() @IsString() costCurrency?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateProductionDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() herdId?: string;
  @IsOptional() @IsString() animalId?: string;
  @IsIn(PRODUCTION_TYPES) productionType!: string;
  @IsDateString() recordedOn!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('livestock')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class LivestockController {
  constructor(private readonly livestock: LivestockRepository) {}

  @Get('herds')
  @RequirePermissions({ resource: 'herd', action: 'SEARCH' })
  async listHerds(@Query('farmId') farmId?: string, @Query('species') species?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.livestock.listHerds(ctx, { farmId, species, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('herds')
  @RequirePermissions({ resource: 'herd', action: 'CREATE' })
  async createHerd(@Body() dto: CreateHerdDto) {
    const ctx = getSecurityContext()!;
    return this.livestock.createHerd(ctx, dto);
  }

  @Get('animals')
  @RequirePermissions({ resource: 'animal', action: 'SEARCH' })
  async listAnimals(@Query('herdId') herdId?: string, @Query('species') species?: string, @Query('status') status?: string, @Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.livestock.listAnimals(ctx, { herdId, species, status, q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('animals')
  @RequirePermissions({ resource: 'animal', action: 'CREATE' })
  async createAnimal(@Body() dto: CreateAnimalDto) {
    const ctx = getSecurityContext()!;
    return this.livestock.createAnimal(ctx, dto);
  }

  @Put('animals/:id')
  @RequirePermissions({ resource: 'animal', action: 'UPDATE' })
  async updateAnimal(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.livestock.updateAnimal(ctx, id, body);
  }

  @Get('animal-health-events')
  @RequirePermissions({ resource: 'animal_health_event', action: 'SEARCH' })
  async listHealthEvents(@Query('animalId') animalId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.livestock.listHealthEvents(ctx, { animalId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('animal-health-events')
  @RequirePermissions({ resource: 'animal_health_event', action: 'CREATE' })
  async createHealthEvent(@Body() dto: CreateHealthEventDto) {
    const ctx = getSecurityContext()!;
    return this.livestock.createHealthEvent(ctx, dto);
  }

  @Get('production-records')
  @RequirePermissions({ resource: 'production_record', action: 'SEARCH' })
  async listProduction(@Query('herdId') herdId?: string, @Query('productionType') productionType?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.livestock.listProduction(ctx, { herdId, productionType, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('production-records')
  @RequirePermissions({ resource: 'production_record', action: 'CREATE' })
  async createProduction(@Body() dto: CreateProductionDto) {
    const ctx = getSecurityContext()!;
    return this.livestock.createProduction(ctx, dto);
  }
}

export { SPECIES, PRODUCTION_TYPES };
