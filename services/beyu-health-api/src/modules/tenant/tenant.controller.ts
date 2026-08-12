import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { TenantRepository } from './tenant.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenants: TenantRepository) {}
  @Get() @RequirePermissions({ resource: 'tenant', action: 'READ' }) async list() { return this.tenants.list(getSecurityContext()!); }
  @Get(':id') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async get(@Param('id') id: string) { return this.tenants.findById(getSecurityContext()!, id); }
  @Get(':id/facilities') @RequirePermissions({ resource: 'tenant', action: 'READ' }) async facilities(@Param('id') id: string) { return this.tenants.facilities(getSecurityContext()!, id); }
}
