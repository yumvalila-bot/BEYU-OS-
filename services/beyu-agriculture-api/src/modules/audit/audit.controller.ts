import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { AuditRepository } from './audit.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditRepository) {}

  @Get()
  @RequirePermissions({ resource: 'audit', action: 'READ' })
  async list(
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const ctx = getSecurityContext();
    if (!ctx) throw new Error('No security context');
    return this.audit.list(ctx, {
      resourceType,
      resourceId,
      action,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
