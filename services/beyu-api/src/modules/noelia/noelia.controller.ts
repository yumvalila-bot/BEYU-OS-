/**
 * Noelia endpoints (spec §41, §54-§57).
 *
 * Read the permissions on these handlers as a statement of the design:
 *
 *   POST /noelia/ask            requires noelia:read   \u2014 asking is a read
 *   POST /noelia/recommendations requires noelia:create \u2014 proposing creates a proposal
 *   POST /noelia/recommendations/:id/review requires noelia:approve
 *
 * Nothing here requires — or grants — permission on capital, waterfall,
 * ownership or governance. Noelia cannot touch those through this controller
 * at any permission level, because no endpoint here writes to them. The review
 * endpoint approves *the recommendation*; enacting the change means calling
 * the owning domain endpoint under the reviewer's own authorization.
 */

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Action, ResourceType } from '@beyu/types';

import { requireSecurity } from '../../common/security';
import { AuditRead } from '../../core/audit.interceptor';
import { RequirePermission } from '../../core/authorization.guard';
import {
  AskNoeliaDto,
  ListActionLogQuery,
  ListConversationsQuery,
  ListRecommendationsQuery,
  ProposeRecommendationDto,
  ReviewRecommendationDto,
} from './noelia.dto';
import { NoeliaRepository } from './noelia.repository';
import type { Page } from '../../common/pagination';
import type {
  AskResult,
  NoeliaActionLogEntry,
  NoeliaAgent,
  NoeliaConversation,
  NoeliaMessage,
  NoeliaRecommendation,
  ProposeResult,
} from './noelia.repository';

@ApiTags('noelia')
@Controller('noelia')
export class NoeliaController {
  constructor(@Inject(NoeliaRepository) private readonly repo: NoeliaRepository) {}

  @Get('agents')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({
    summary: 'Lists the registered Noelia agents and the scopes each is permitted.',
  })
  agents(): Promise<NoeliaAgent[]> {
    return this.repo.listAgents(requireSecurity());
  }

  @Post('ask')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @ApiOperation({
    summary: 'Asks Noelia a question.',
    description:
      'Answered only from records the caller is already authorized to read, after ' +
      'field-level minimization. The response names the provider that answered; ' +
      'when that is "stub-deterministic", no language model was involved and the ' +
      'answer is retrieval, not analysis.',
  })
  ask(@Body() body: AskNoeliaDto): Promise<AskResult> {
    return this.repo.ask(requireSecurity(), body);
  }

  @Get('conversations')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({ summary: "Lists the caller's own Noelia conversations." })
  conversations(@Query() query: ListConversationsQuery): Promise<Page<NoeliaConversation>> {
    return this.repo.listConversations(requireSecurity(), query);
  }

  @Get('conversations/:id/messages')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({ summary: 'Returns the transcript of one of the caller\u2019s conversations.' })
  messages(@Param('id', ParseUUIDPipe) id: string): Promise<NoeliaMessage[]> {
    return this.repo.listMessages(requireSecurity(), id);
  }

  @Post('recommendations')
  @RequirePermission(ResourceType.Noelia, Action.Create)
  @ApiOperation({
    summary: 'Records a Noelia proposal for human review.',
    description:
      'The governance layer decides the verdict. A proposal to mutate a material ' +
      'domain \u2014 capital, waterfall, ownership, governance, compliance, ' +
      'organization \u2014 is always downgraded to a recommendation requiring named ' +
      'human approval, whatever permissions the caller holds. A forbidden action ' +
      'is DENIED outright and nothing is queued.',
  })
  @ApiResponse({ status: 201, description: 'Verdict, and the recommendation if one was recorded.' })
  propose(@Body() body: ProposeRecommendationDto): Promise<ProposeResult> {
    return this.repo.propose(requireSecurity(), body);
  }

  @Get('recommendations')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({ summary: 'Lists recommendations awaiting or past review.' })
  listRecommendations(
    @Query() query: ListRecommendationsQuery,
  ): Promise<Page<NoeliaRecommendation>> {
    return this.repo.listRecommendations(requireSecurity(), query);
  }

  @Get('recommendations/:id')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({ summary: 'Returns a single recommendation, including its review state.' })
  findRecommendation(@Param('id', ParseUUIDPipe) id: string): Promise<NoeliaRecommendation> {
    return this.repo.findRecommendation(requireSecurity(), id);
  }

  @Post('recommendations/:id/review')
  @RequirePermission(ResourceType.Noelia, Action.Approve)
  @ApiOperation({
    summary: 'Records a human decision on a recommendation.',
    description:
      'ACCEPTING DOES NOT EXECUTE. It records that you, by name and at a recorded ' +
      'time, agree the proposed change should be made. Making it is a separate act ' +
      'through the owning domain endpoint, under your own authorization and your own ' +
      'audit record. The decision is final: a reviewed recommendation is superseded, ' +
      'never reopened.',
  })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewRecommendationDto,
  ): Promise<NoeliaRecommendation> {
    return this.repo.review(requireSecurity(), id, body);
  }

  @Get('action-log')
  @RequirePermission(ResourceType.Noelia, Action.Read)
  @AuditRead()
  @ApiOperation({
    summary: 'Every AI action attempt and the verdict it received.',
    description:
      'Includes refusals. A log of only what was allowed cannot answer what the ' +
      'agent tried to do, which is the question that matters on review.',
  })
  actionLog(@Query() query: ListActionLogQuery): Promise<Page<NoeliaActionLogEntry>> {
    return this.repo.listActionLog(requireSecurity(), query);
  }
}
