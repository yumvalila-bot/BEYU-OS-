/**
 * OS federation endpoints (spec §69, §70, §71).
 *
 * These are the attachment points. Health OS, Agriculture OS, Finance OS and
 * FOUNDATION OS are independent systems with their own databases, deployments
 * and release cycles; they are never built inside this repository. What they
 * share is this contract: register, attach at a legal point in the hierarchy,
 * receive explicitly granted capabilities and event topics, and submit
 * requests that a human being decides on.
 *
 * There is deliberately no DELETE. A retired OS keeps its row because its
 * identifier appears throughout the audit chain, and history that points at a
 * missing registration cannot be interpreted later.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Action, ResourceType, type OsRegistration } from '@beyu/types';

import { requireSecurity } from '../../common/security';
import { RequirePermission } from '../../core/authorization.guard';
import {
  AttachOsDto,
  GrantCapabilitiesDto,
  GrantEventTopicDto,
  ListOsQuery,
  RegisterOsDto,
  UpdateOsStatusDto,
} from './os-registry.dto';
import { OsRegistryRepository } from './os-registry.repository';
import type { Page } from '../../common/pagination';

@ApiTags('os-registry')
@Controller('os-registry')
export class OsRegistryController {
  constructor(@Inject(OsRegistryRepository) private readonly repo: OsRegistryRepository) {}

  @Get()
  @RequirePermission(ResourceType.Os, Action.Read)
  @ApiOperation({ summary: 'Lists every OS attached to BEYU OS, core first.' })
  list(@Query() query: ListOsQuery): Promise<Page<OsRegistration>> {
    return this.repo.list(requireSecurity(), query);
  }

  @Get(':osId')
  @RequirePermission(ResourceType.Os, Action.Read)
  @ApiOperation({ summary: 'Returns a single OS registration.' })
  findOne(@Param('osId') osId: string): Promise<OsRegistration> {
    return this.repo.findByOsId(requireSecurity(), osId);
  }

  @Get(':osId/event-grants')
  @RequirePermission(ResourceType.Os, Action.Read)
  @ApiOperation({
    summary: 'Lists the control plane topics this OS is entitled to receive.',
  })
  eventGrants(@Param('osId') osId: string): Promise<{ topics: string[] }> {
    return this.repo
      .listEventGrants(requireSecurity(), osId)
      .then((topics) => ({ topics }));
  }

  @Post()
  @RequirePermission(ResourceType.Os, Action.Create)
  @ApiOperation({
    summary: 'Registers an OS.',
    description:
      'The OS starts REGISTERED, attached to nothing, holding no capabilities and subscribed to no events. Every one of those is a separate, individually audited decision.',
  })
  register(@Body() dto: RegisterOsDto): Promise<OsRegistration> {
    return this.repo.register(requireSecurity(), dto);
  }

  @Post(':osId/attach')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(ResourceType.Os, Action.Update)
  @ApiOperation({
    summary: 'Attaches a registered OS to its node in the hierarchy.',
    description:
      'A SECTOR_OS attaches to a Sector LLC, which is where BEYU OS ends. FOUNDATION OS attaches to BEYU FOUNDATION, a sister organization to BEYU HOLDING COMPANY.',
  })
  attach(@Param('osId') osId: string, @Body() dto: AttachOsDto): Promise<OsRegistration> {
    return this.repo.attach(requireSecurity(), osId, dto);
  }

  @Patch(':osId/capabilities')
  @RequirePermission(ResourceType.Os, Action.Update)
  @ApiOperation({
    summary: 'Replaces the capabilities granted to an OS.',
    description:
      'Capabilities that would let an external system execute waterfall distributions, approve capital or governance, alter audit history, reach the database directly, bypass authorization or read another OS are permanently ungrantable and rejected here and again in the database.',
  })
  grantCapabilities(
    @Param('osId') osId: string,
    @Body() dto: GrantCapabilitiesDto,
  ): Promise<OsRegistration> {
    return this.repo.grantCapabilities(requireSecurity(), osId, dto);
  }

  @Patch(':osId/status')
  @RequirePermission(ResourceType.Os, Action.Update)
  @ApiOperation({
    summary: 'Moves an OS through its lifecycle.',
    description:
      'ACTIVE is reachable only from SECURITY_VALIDATION, and only once the OS is attached and has an endpoint. RETIRED is terminal.',
  })
  updateStatus(
    @Param('osId') osId: string,
    @Body() dto: UpdateOsStatusDto,
  ): Promise<OsRegistration> {
    return this.repo.updateStatus(requireSecurity(), osId, dto);
  }

  @Post(':osId/event-grants')
  @RequirePermission(ResourceType.Os, Action.Update)
  @ApiOperation({
    summary: 'Grants an OS the right to receive one control plane topic.',
    description:
      'Fan-out is driven entirely by these grants and only to ACTIVE OSs, so an OS never receives a topic nobody granted it, and a suspended OS stops receiving events immediately.',
  })
  grantEventTopic(
    @Param('osId') osId: string,
    @Body() dto: GrantEventTopicDto,
  ): Promise<{ osId: string; topic: string }> {
    return this.repo.grantEventTopic(requireSecurity(), osId, dto);
  }
}
