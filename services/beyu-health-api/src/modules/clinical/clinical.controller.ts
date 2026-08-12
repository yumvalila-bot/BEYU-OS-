import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { ClinicalRepository } from './clinical.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateEncounterDto {
  @IsString() patientId!: string;
  @IsString() facilityId!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() practitionerId?: string;
  @IsIn(['AMBULATORY','EMERGENCY','INPATIENT','OUTPATIENT','HOME','VIRTUAL','FIELD']) class!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() priority?: string;
}

class CreateNoteDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() encounterId?: string;
  @IsIn(['PROGRESS','ADMISSION','DISCHARGE','PROCEDURE','CONSULTATION','NURSING','OPHTHALMOLOGY','OTHER']) type!: string;
  @IsString() title!: string;
  @IsString() content!: string;
}

class CreateVitalDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() encounterId?: string;
  @IsIn(['BLOOD_PRESSURE','HEART_RATE','TEMPERATURE','RESPIRATORY_RATE','SPO2','WEIGHT','HEIGHT','BMI','OTHER']) type!: string;
  @IsNumber() value!: number;
  @IsString() unit!: string;
  @IsOptional() @IsNumber() systolic?: number;
  @IsOptional() @IsNumber() diastolic?: number;
}

@ApiTags('clinical')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('clinical')
export class ClinicalController {
  constructor(private readonly clinical: ClinicalRepository) {}

  @Get('encounters')
  @RequirePermissions({ resource: 'encounter', action: 'READ' })
  async listEncounters(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.clinical.listEncounters(getSecurityContext()!, { patientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Get('encounters/:id')
  @RequirePermissions({ resource: 'encounter', action: 'READ' })
  async getEncounter(@Param('id') id: string) { return this.clinical.getEncounter(getSecurityContext()!, id); }

  @Post('encounters')
  @RequirePermissions({ resource: 'encounter', action: 'CREATE' })
  async createEncounter(@Body() dto: CreateEncounterDto) { return this.clinical.createEncounter(getSecurityContext()!, dto); }

  @Post('notes')
  @RequirePermissions({ resource: 'clinical_note', action: 'CREATE' })
  async createNote(@Body() dto: CreateNoteDto) { return this.clinical.createNote(getSecurityContext()!, dto); }

  @Post('vitals')
  @RequirePermissions({ resource: 'encounter', action: 'CREATE' })
  async createVital(@Body() dto: CreateVitalDto) { return this.clinical.createVital(getSecurityContext()!, dto); }

  @Get('vitals/:patientId')
  @RequirePermissions({ resource: 'encounter', action: 'READ' })
  async vitals(@Param('patientId') patientId: string) { return this.clinical.vitalSigns(getSecurityContext()!, patientId); }
}
