import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { RadiologyRepository } from './radiology.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateImagingOrderDto { @IsString() patientId!: string; @IsOptional() @IsString() encounterId?: string; @IsIn(['XRAY','CT','MRI','US','MAMMOGRAPHY','FUNDUS_PHOTOGRAPHY','OCT','OCTA','VISUAL_FIELD','CORNEAL_TOPOGRAPHY','PACHYMETRY','BIOMETRY','KERATOMETRY','SLIT_LAMP_IMAGING','EXTERNAL_PHOTOGRAPHY','OTHER']) modality!: string; @IsOptional() @IsString() bodySite?: string; @IsOptional() @IsString() indication?: string; @IsOptional() @IsString() priority?: string; }

@ApiTags('radiology')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('radiology')
export class RadiologyController {
  constructor(private readonly radiology: RadiologyRepository) {}
  @Get('orders') @RequirePermissions({ resource: 'radiology', action: 'READ' }) async orders(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.radiology.orders(getSecurityContext()!, { patientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('orders') @RequirePermissions({ resource: 'radiology', action: 'CREATE' }) async createOrder(@Body() dto: CreateImagingOrderDto) { return this.radiology.createOrder(getSecurityContext()!, dto); }
  @Post('studies') @RequirePermissions({ resource: 'radiology', action: 'MANAGE' }) async createStudy(@Body() body: { orderId: string; modality: string; bodySite?: string }) { return this.radiology.createStudy(getSecurityContext()!, body.orderId, { modality: body.modality, bodySite: body.bodySite }); }
  @Post('studies/:id/report') @RequirePermissions({ resource: 'radiology', action: 'REPORT' }) async createReport(@Param('id') id: string, @Body() body: { findings: string; impression: string; conclusion?: string }) { return this.radiology.createReport(getSecurityContext()!, id, body); }
}
