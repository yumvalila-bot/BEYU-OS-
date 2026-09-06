import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { ComplianceRepository } from './compliance.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateCertificationDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsIn(['GLOBAL_GAP', 'ORGANIC', 'FAIRTRADE', 'RAINFOREST_ALLIANCE', 'HACCP', 'ISO_22000', 'PHYTOSANITARY', 'EXPORT_QUALITY', 'OTHER']) certificationType!: string;
  @IsString() certificateNumber!: string;
  @IsOptional() @IsDateString() issuedOn?: string;
  @IsOptional() @IsDateString() expiresOn?: string;
  @IsOptional() @IsString() issuedBy?: string;
  @IsOptional() @IsString() scopeNotes?: string;
}

class CreateInspectionDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsOptional() @IsString() certificationId?: string;
  @IsDateString() inspectedOn!: string;
  @IsOptional() @IsString() inspectedBy?: string;
  @IsIn(['PASS', 'CONDITIONAL', 'FAIL']) result!: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() followUpRequired?: boolean;
}

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class ComplianceController {
  constructor(private readonly compliance: ComplianceRepository) {}

  @Get('certifications')
  @RequirePermissions({ resource: 'certification', action: 'SEARCH' })
  async listCertifications(@Query('farmId') farmId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.compliance.listCertifications(ctx, { farmId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('certifications')
  @RequirePermissions({ resource: 'certification', action: 'CREATE' })
  async createCertification(@Body() dto: CreateCertificationDto) {
    const ctx = getSecurityContext()!;
    return this.compliance.createCertification(ctx, dto);
  }

  @Get('inspections')
  @RequirePermissions({ resource: 'inspection', action: 'SEARCH' })
  async listInspections(@Query('farmId') farmId?: string, @Query('result') result?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.compliance.listInspections(ctx, { farmId, result, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('inspections')
  @RequirePermissions({ resource: 'inspection', action: 'CREATE' })
  async createInspection(@Body() dto: CreateInspectionDto) {
    const ctx = getSecurityContext()!;
    return this.compliance.createInspection(ctx, dto);
  }

  @Get('traceability/lots/:id')
  @RequirePermissions({ resource: 'storage_lot', action: 'READ' })
  async trace(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.compliance.trace(ctx, id);
  }
}
