import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { InsuranceRepository } from './insurance.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateClaimDto { @IsString() patientId!: string; @IsOptional() @IsString() encounterId?: string; @IsString() payerId!: string; @IsOptional() @IsString() invoiceId?: string; @IsNumber() totalMinor!: number; }

@ApiTags('insurance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insurance: InsuranceRepository) {}
  @Get('payers') @RequirePermissions({ resource: 'insurance', action: 'READ' }) async payers() { return this.insurance.payers(getSecurityContext()!); }
  @Get('claims') @RequirePermissions({ resource: 'insurance', action: 'READ' }) async claims(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.insurance.claims(getSecurityContext()!, { patientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('claims') @RequirePermissions({ resource: 'insurance', action: 'CREATE' }) async create(@Body() dto: CreateClaimDto) { return this.insurance.createClaim(getSecurityContext()!, dto); }
  @Post('claims/:id/submit') @RequirePermissions({ resource: 'insurance', action: 'SUBMIT' }) async submit(@Param('id') id: string) { return this.insurance.submitClaim(getSecurityContext()!, id); }
}
