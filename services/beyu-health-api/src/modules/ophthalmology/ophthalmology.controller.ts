import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsArray, IsNumber, IsIn } from 'class-validator';
import { OphthalmologyRepository } from './ophthalmology.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateOphthalmologyExamDto {
  @IsString() patientId!: string;
  @IsString() encounterId!: string;
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() examinationType?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() history?: any;
  @IsOptional() @IsArray() visualAcuity?: any[];
  @IsOptional() @IsArray() refraction?: any[];
  @IsOptional() @IsArray() iop?: any[];
  @IsOptional() @IsArray() slitLamp?: any[];
  @IsOptional() @IsArray() fundus?: any[];
  @IsOptional() @IsArray() diagnoses?: any[];
}

class CreateImagingDto { @IsString() patientId!: string; @IsString() encounterId!: string; @IsIn(['OD','OS','OU']) eye!: string; @IsString() modality!: string; @IsOptional() @IsString() findings?: string; @IsOptional() @IsString() imageUrl?: string; }
class CreateOpticalPrescriptionDto { @IsString() patientId!: string; @IsString() encounterId!: string; @IsIn(['SINGLE_VISION','BIFOCAL','PROGRESSIVE','CONTACT_LENS','LOW_VISION']) type!: string; @IsOptional() @IsNumber() odSphere?: number; @IsOptional() @IsNumber() odCylinder?: number; @IsOptional() @IsNumber() odAxis?: number; @IsOptional() @IsNumber() odAdd?: number; @IsOptional() @IsNumber() osSphere?: number; @IsOptional() @IsNumber() osCylinder?: number; @IsOptional() @IsNumber() osAxis?: number; @IsOptional() @IsNumber() osAdd?: number; @IsOptional() @IsString() notes?: string; }

@ApiTags('ophthalmology')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('ophthalmology')
export class OphthalmologyController {
  constructor(private readonly ophth: OphthalmologyRepository) {}

  @Get('exams') @RequirePermissions({ resource: 'ophthalmology', action: 'READ' })
  async listExams(@Query('patientId') patientId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.ophth.listExams(getSecurityContext()!, { patientId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Get('exams/:id') @RequirePermissions({ resource: 'ophthalmology', action: 'READ' })
  async getExam(@Param('id') id: string) { return this.ophth.getExam(getSecurityContext()!, id); }

  @Post('exams') @RequirePermissions({ resource: 'ophthalmology', action: 'CREATE' })
  async createExam(@Body() dto: CreateOphthalmologyExamDto) { return this.ophth.createExam(getSecurityContext()!, dto); }

  @Post('imaging') @RequirePermissions({ resource: 'ophthalmology', action: 'CREATE' })
  async createImaging(@Body() dto: CreateImagingDto) { return this.ophth.createImaging(getSecurityContext()!, dto); }

  @Post('prescriptions') @RequirePermissions({ resource: 'ophthalmology', action: 'CREATE' })
  async createPrescription(@Body() dto: CreateOpticalPrescriptionDto) { return this.ophth.createPrescription(getSecurityContext()!, dto); }

  @Get('analytics/disease-patterns') @RequirePermissions({ resource: 'reports', action: 'READ' })
  async diseasePatterns(@Query('facilityId') facilityId?: string) { return this.ophth.diseasePatterns(getSecurityContext()!, facilityId); }
}
