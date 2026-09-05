import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsEmail, IsArray, IsDateString, IsIn } from 'class-validator';
import { PatientRepository } from './patient.repository';
import { getSecurityContext } from '../../core/request-context';

class CreatePatientDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsIn(['MALE','FEMALE','OTHER','UNKNOWN']) gender!: string;
  @IsDateString() dateOfBirth!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsArray() emergencyContacts?: Array<{ name: string; relationship: string; phone: string; isPrimary?: boolean }>;
}

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('patients')
export class PatientController {
  constructor(private readonly patients: PatientRepository) {}

  @Get()
  @RequirePermissions({ resource: 'patient', action: 'SEARCH' })
  async list(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('status') status?: string) {
    const ctx = getSecurityContext()!;
    return this.patients.list(ctx, { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined, status });
  }

  @Get(':id')
  @RequirePermissions({ resource: 'patient', action: 'READ' })
  async get(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    return this.patients.findById(ctx, id);
  }

  @Get(':id/timeline')
  @RequirePermissions({ resource: 'patient', action: 'READ' })
  async timeline(@Param('id') id: string) {
    const ctx = getSecurityContext()!;
    const patient = await this.patients.findById(ctx, id);
    const timeline = await this.patients.timeline(ctx, id);
    return { patient: { id: patient.id, mrn: patient.mrn, first_name: patient.first_name, last_name: patient.last_name }, timeline };
  }

  @Post()
  @RequirePermissions({ resource: 'patient', action: 'CREATE' })
  async create(@Body() dto: CreatePatientDto) {
    const ctx = getSecurityContext()!;
    return this.patients.create(ctx, {
      tenantId: ctx.activeTenantId ?? ctx.tenantId!,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth,
      phone: dto.phone,
      email: dto.email,
      nationalId: dto.nationalId,
      address: dto.address,
      bloodGroup: dto.bloodGroup,
      emergencyContacts: dto.emergencyContacts,
      createdBy: ctx.userId,
    });
  }

  @Put(':id')
  @RequirePermissions({ resource: 'patient', action: 'UPDATE' })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.patients.update(ctx, id, body);
  }
}
