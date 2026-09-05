import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { AppointmentRepository } from './appointment.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateAppointmentDto {
  @IsString() patientId!: string;
  @IsString() facilityId!: string;
  @IsOptional() @IsString() practitionerId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsDateString() start!: string;
  @IsDateString() end!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsBoolean() isTelemedicine?: boolean;
}

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointments: AppointmentRepository) {}

  @Get() @RequirePermissions({ resource: 'appointment', action: 'READ' })
  async list(@Query('patientId') patientId?: string, @Query('practitionerId') practitionerId?: string, @Query('facilityId') facilityId?: string, @Query('date') date?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.appointments.list(getSecurityContext()!, { patientId, practitionerId, facilityId, date, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post() @RequirePermissions({ resource: 'appointment', action: 'CREATE' })
  async create(@Body() dto: CreateAppointmentDto) { return this.appointments.create(getSecurityContext()!, dto); }

  @Put(':id/status') @RequirePermissions({ resource: 'appointment', action: 'UPDATE' })
  async updateStatus(@Param('id') id: string, @Body() body: { status: string; reason?: string }) { return this.appointments.updateStatus(getSecurityContext()!, id, body.status, body.reason); }

  @Get('queues/:facilityId') @RequirePermissions({ resource: 'appointment', action: 'READ' })
  async queues(@Param('facilityId') facilityId: string) { return this.appointments.queues(getSecurityContext()!, facilityId); }
}
