import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';
import { TriageRepository } from './triage.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateTriageDto { @IsString() patientId!: string; @IsString() encounterId!: string; @IsString() facilityId!: string; @IsString() category!: string; @IsString() chiefComplaint!: string; @IsOptional() @IsObject() vitalSigns?: any; @IsOptional() @IsNumber() acuityScore?: number; @IsOptional() @IsString() notes?: string; }

@ApiTags('triage')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('triage')
export class TriageController {
  constructor(private readonly triage: TriageRepository) {}
  @Get() @RequirePermissions({ resource: 'encounter', action: 'READ' }) async list(@Query('facilityId') facilityId?: string, @Query('category') category?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.triage.list(getSecurityContext()!, { facilityId, category, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post() @RequirePermissions({ resource: 'encounter', action: 'CREATE' }) async create(@Body() dto: CreateTriageDto) { return this.triage.create(getSecurityContext()!, dto); }
}
