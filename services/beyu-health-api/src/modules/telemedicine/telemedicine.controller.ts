import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString } from 'class-validator';
import { TelemedicineRepository } from './telemedicine.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('telemedicine')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('telemedicine')
export class TelemedicineController {
  constructor(private readonly telemed: TelemedicineRepository) {}
  @Get('sessions') @RequirePermissions({ resource: 'telemedicine', action: 'READ' }) async list(@Query('patientId') patientId?: string, @Query('practitionerId') practitionerId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.telemed.list(getSecurityContext()!, { patientId, practitionerId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('sessions') @RequirePermissions({ resource: 'telemedicine', action: 'CREATE' }) async create(@Body() body: { appointmentId: string; patientId: string; practitionerId: string }) { return this.telemed.create(getSecurityContext()!, body); }
  @Put('sessions/:id/status') @RequirePermissions({ resource: 'telemedicine', action: 'READ' }) async updateStatus(@Param('id') id: string, @Body() body: { status: string }) { return this.telemed.updateStatus(getSecurityContext()!, id, body.status); }
}
