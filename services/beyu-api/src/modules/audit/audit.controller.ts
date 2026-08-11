/**
 * Audit trail API (spec §39).
 *
 * Read and verify only. There is deliberately no write, update or delete
 * endpoint: audit records are produced by the system as a side effect of
 * activity, never authored through the API. The database revokes UPDATE and
 * DELETE on this table, and the policy engine treats those actions as
 * never-grantable.
 */

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Action, ResourceType, type AuditChainVerification, type AuditEvent } from '@beyu/types';

import { AuditRead } from '../../core/audit.interceptor';
import { RequirePermission } from '../../core/authorization.guard';
import { AuditRepository } from './audit.repository';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(@Inject(AuditRepository) private readonly audit: AuditRepository) {}

  @Get()
  @RequirePermission(ResourceType.Audit, Action.Read)
  @AuditRead()
  @ApiOperation({ summary: 'Lists audit records in chain order.' })
  async list(
    @Query('fromSequence') fromSequence?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: AuditEvent[]; count: number }> {
    const items = await this.audit.list({
      fromSequence: fromSequence ? Number(fromSequence) : undefined,
      limit: limit ? Math.min(Number(limit), 500) : 100,
    });
    return { items, count: items.length };
  }

  @Get('verify')
  @RequirePermission(ResourceType.Audit, Action.Read)
  @AuditRead()
  @ApiOperation({
    summary: 'Recomputes the hash chain and reports the first break, if any.',
  })
  async verify(@Query('fromSequence') fromSequence?: string): Promise<AuditChainVerification> {
    return this.audit.verify({
      fromSequence: fromSequence ? Number(fromSequence) : undefined,
    });
  }
}
