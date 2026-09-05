import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { AmbulanceRepository } from './ambulance.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('ambulance')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('ambulance')
export class AmbulanceController {
  constructor(private readonly ambulance: AmbulanceRepository) {}
  @Get('vehicles') @RequirePermissions({ resource: 'ambulance', action: 'READ' }) async vehicles() { return this.ambulance.listVehicles(getSecurityContext()!); }
  @Get('requests') @RequirePermissions({ resource: 'ambulance', action: 'READ' }) async requests(@Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.ambulance.requests(getSecurityContext()!, { status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post('requests') @RequirePermissions({ resource: 'ambulance', action: 'CREATE' }) async createRequest(@Body() body: { callerName: string; callerPhone: string; incidentType: string; priority: string; pickupAddress?: string; pickupLat?: number; pickupLng?: number; destinationFacilityId?: string; }) { return this.ambulance.createRequest(getSecurityContext()!, body); }
  @Post('dispatch') @RequirePermissions({ resource: 'ambulance', action: 'DISPATCH' }) async dispatch(@Body() body: { requestId: string; ambulanceId: string }) { return this.ambulance.dispatch(getSecurityContext()!, body.requestId, body.ambulanceId); }
  @Post('vehicles/:id/location') @RequirePermissions({ resource: 'ambulance', action: 'DISPATCH' }) async updateLocation(@Param('id') id: string, @Body() body: { lat: number; lng: number }) { return this.ambulance.updateLocation(getSecurityContext()!, id, body.lat, body.lng); }
}
