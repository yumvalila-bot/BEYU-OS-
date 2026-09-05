import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { PharmacyRepository } from './pharmacy.repository';
import { getSecurityContext } from '../../core/request-context';

class CreatePrescriptionDto {
  @IsString() patientId!: string;
  @IsOptional() @IsString() encounterId?: string;
  @IsString() drugId!: string;
  @IsString() dosageInstruction!: string;
  @IsNumber() quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsNumber() durationDays?: number;
  @IsOptional() @IsIn(['ROUTINE','URGENT','ASAP','STAT']) priority?: string;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('pharmacy')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyRepository) {}
  @Get('drugs') @RequirePermissions({ resource: 'pharmacy', action: 'READ' }) async drugs(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.pharmacy.drugs(getSecurityContext()!, { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('prescriptions') @RequirePermissions({ resource: 'pharmacy', action: 'READ' }) async prescriptions(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.pharmacy.prescriptions(getSecurityContext()!, { patientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('safety/:patientId/:drugId') @RequirePermissions({ resource: 'pharmacy', action: 'READ' }) async safety(@Param('patientId') patientId: string, @Param('drugId') drugId: string) { return this.pharmacy.safetyCheck(getSecurityContext()!, patientId, drugId); }
  @Post('prescriptions') @RequirePermissions({ resource: 'pharmacy', action: 'CREATE' }) async create(@Body() dto: CreatePrescriptionDto) { return this.pharmacy.createPrescription(getSecurityContext()!, dto); }
  @Post('prescriptions/:id/dispense') @RequirePermissions({ resource: 'pharmacy', action: 'DISPENSE' }) async dispense(@Param('id') id: string, @Body() body: { quantity: number; unit: string; batchNumber?: string }) { return this.pharmacy.dispense(getSecurityContext()!, id, body); }
}
