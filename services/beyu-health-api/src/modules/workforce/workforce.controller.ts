import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional } from 'class-validator';
import { WorkforceRepository } from './workforce.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('workforce')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('workforce')
export class WorkforceController {
  constructor(private readonly workforce: WorkforceRepository) {}
  @Get('practitioners') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async list(@Query('q') q?: string, @Query('facilityId') facilityId?: string, @Query('specialty') specialty?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.workforce.list(getSecurityContext()!, { q, facilityId, specialty, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('practitioners/:id') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async get(@Param('id') id: string) { return this.workforce.getById(getSecurityContext()!, id); }
  @Post('practitioners') @RequirePermissions({ resource: 'workforce', action: 'CREATE' }) async create(@Body() body: { code: string; firstName: string; lastName: string; specialty?: string; qualification?: string; licenseNumber?: string; phone?: string; email?: string; primaryFacilityId?: string; employmentType?: string }) { return this.workforce.create(getSecurityContext()!, body); }
  @Get('practitioners/:id/shifts') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async shifts(@Param('id') id: string) { return this.workforce.shifts(getSecurityContext()!, id); }
  @Post('shifts') @RequirePermissions({ resource: 'workforce', action: 'CREATE' }) async createShift(@Body() body: { practitionerId: string; facilityId: string; departmentId?: string; start: string; end: string; type: string }) { return this.workforce.createShift(getSecurityContext()!, body); }
  @Get('practitioners/:id/attendance') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async attendance(@Param('id') id: string) { return this.workforce.attendance(getSecurityContext()!, id); }
  @Post('practitioners/:id/check-in') @RequirePermissions({ resource: 'workforce', action: 'CREATE' }) async checkIn(@Param('id') id: string, @Body() body: { method?: string; lat?: number; lng?: number }) { return this.workforce.checkIn(getSecurityContext()!, id, body); }
}
