import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { LaboratoryRepository } from './laboratory.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateLabOrderDto { @IsString() patientId!: string; @IsOptional() @IsString() encounterId?: string; @IsArray() tests!: string[]; @IsOptional() @IsString() priority?: string; @IsOptional() @IsString() clinicalInfo?: string; }
class CreateResultDto { @IsString() testId!: string; @IsOptional() @IsNumber() valueQuantity?: number; @IsOptional() @IsString() valueUnit?: string; @IsOptional() @IsString() valueString?: string; @IsOptional() @IsString() interpretation?: string; @IsOptional() @IsBoolean() isCritical?: boolean; }

@ApiTags('laboratory')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('laboratory')
export class LaboratoryController {
  constructor(private readonly lab: LaboratoryRepository) {}
  @Get('catalog') @RequirePermissions({ resource: 'laboratory', action: 'READ' }) async catalog(@Query('q') q?: string) { return this.lab.catalog(getSecurityContext()!, q); }
  @Get('orders') @RequirePermissions({ resource: 'laboratory', action: 'READ' }) async orders(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.lab.orders(getSecurityContext()!, { patientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('orders') @RequirePermissions({ resource: 'laboratory', action: 'CREATE' }) async createOrder(@Body() dto: CreateLabOrderDto) { return this.lab.createOrder(getSecurityContext()!, dto); }
  @Post('orders/:id/results') @RequirePermissions({ resource: 'laboratory', action: 'VERIFY' }) async addResult(@Param('id') id: string, @Body() dto: CreateResultDto) { return this.lab.addResult(getSecurityContext()!, id, dto); }
  @Get('results/:patientId') @RequirePermissions({ resource: 'laboratory', action: 'READ' }) async results(@Param('patientId') patientId: string) { return this.lab.results(getSecurityContext()!, patientId); }
}
