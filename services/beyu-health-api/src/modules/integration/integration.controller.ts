import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { IntegrationRepository } from './integration.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integration: IntegrationRepository) {}
  @Get('configs') async configs() { return this.integration.configs(getSecurityContext()!); }
  @Get('fhir/:resourceType') async fhirSearch(@Param('resourceType') resourceType: string, @Query('patientId') patientId?: string) { return this.integration.fhirSearch(getSecurityContext()!, resourceType, patientId); }
  @Post('fhir') async createFhir(@Body() body: { fhirId: string; resourceType: string; data: any; patientId?: string }) { return this.integration.createFhir(getSecurityContext()!, body); }
  @Get('feature-flags') async flags() { return this.integration.featureFlags(getSecurityContext()!); }
  @Get('events/outbox') async outbox(@Query('limit') limit?: string) { return this.integration.eventOutbox(getSecurityContext()!, limit ? Number(limit) : 20); }
}
