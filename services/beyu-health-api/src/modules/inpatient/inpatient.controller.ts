import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional } from 'class-validator';
import { InpatientRepository } from './inpatient.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('inpatient')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('inpatient')
export class InpatientController {
  constructor(private readonly inpatient: InpatientRepository) {}
  @Get('admissions') @RequirePermissions({ resource: 'encounter', action: 'READ' }) async admissions(@Query('facilityId') facilityId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.inpatient.admissions(getSecurityContext()!, { facilityId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('admissions') @RequirePermissions({ resource: 'encounter', action: 'CREATE' }) async admit(@Body() body: { patientId: string; encounterId: string; facilityId: string; departmentId?: string; bedId?: string; admissionType?: string }) { return this.inpatient.admit(getSecurityContext()!, body); }
  @Put('admissions/:id/discharge') @RequirePermissions({ resource: 'encounter', action: 'UPDATE' }) async discharge(@Param('id') id: string, @Body() body: { summary: string }) { return this.inpatient.discharge(getSecurityContext()!, id, body.summary); }
  @Get('beds/:facilityId') @RequirePermissions({ resource: 'encounter', action: 'READ' }) async beds(@Param('facilityId') facilityId: string) { return this.inpatient.beds(getSecurityContext()!, facilityId); }
}
