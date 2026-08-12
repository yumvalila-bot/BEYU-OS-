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
  @Get('practitioners') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async list(@Query('q') q?: string, @Query('facilityId') facilityId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.workforce.list(getSecurityContext()!, { q, facilityId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('practitioners/:id/shifts') @RequirePermissions({ resource: 'workforce', action: 'READ' }) async shifts(@Param('id') id: string) { return this.workforce.shifts(getSecurityContext()!, id); }
  @Post('shifts') @RequirePermissions({ resource: 'workforce', action: 'CREATE' }) async createShift(@Body() body: { practitionerId: string; facilityId: string; start: string; end: string; type: string }) { return this.workforce.createShift(getSecurityContext()!, body); }
}
