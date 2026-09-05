/**
 * Organization endpoints (spec §18).
 *
 * There is deliberately no DELETE. Organizational nodes are the anchor for
 * ownership, governance and audit history; removing one would orphan records
 * that must remain interpretable years later. A node that no longer operates
 * is set to DISSOLVED, which preserves the history while removing it from
 * active use. The database reinforces this with ON DELETE RESTRICT.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Action, ResourceType, type OrgNode, type OrgTreeNode } from '@beyu/types';

import { requireSecurity } from '../../common/security';
import { RequirePermission } from '../../core/authorization.guard';
import { CreateOrgNodeDto, ListOrgNodesQuery, MoveOrgNodeDto, UpdateOrgNodeDto } from './organizations.dto';
import { OrganizationsRepository } from './organizations.repository';
import type { Page } from '../../common/pagination';

@ApiTags('organization')
@Controller('organizations')
export class OrganizationsController {
  constructor(@Inject(OrganizationsRepository) private readonly repo: OrganizationsRepository) {}

  @Get()
  @RequirePermission(ResourceType.Organization, Action.Read)
  @ApiOperation({ summary: 'Lists organizational nodes in hierarchy order.' })
  list(@Query() query: ListOrgNodesQuery): Promise<Page<OrgNode>> {
    return this.repo.list(requireSecurity(), query);
  }

  @Get(':id')
  @RequirePermission(ResourceType.Organization, Action.Read)
  @ApiOperation({ summary: 'Returns a single organizational node.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrgNode> {
    return this.repo.findById(requireSecurity(), id);
  }

  @Get(':id/subtree')
  @RequirePermission(ResourceType.Organization, Action.Read)
  @ApiOperation({ summary: 'Returns the node and all of its descendants as a tree.' })
  subtree(@Param('id', ParseUUIDPipe) id: string): Promise<OrgTreeNode> {
    return this.repo.subtree(requireSecurity(), id);
  }

  @Get(':id/ancestors')
  @RequirePermission(ResourceType.Organization, Action.Read)
  @ApiOperation({ summary: 'Returns the root-to-node chain.' })
  ancestors(@Param('id', ParseUUIDPipe) id: string): Promise<OrgNode[]> {
    return this.repo.ancestors(requireSecurity(), id);
  }

  @Post()
  @RequirePermission(ResourceType.Organization, Action.Create)
  @ApiOperation({
    summary: 'Creates an organizational node.',
    description:
      'The canonical hierarchy is enforced: BEYU FOUNDATION attaches to the Trust as a ' +
      'sister of BEYU HOLDING COMPANY, and node types below SECTOR_LLC are rejected as ' +
      'outside the BEYU OS boundary.',
  })
  create(@Body() dto: CreateOrgNodeDto): Promise<OrgNode> {
    return this.repo.create(requireSecurity(), dto);
  }

  @Patch(':id')
  @RequirePermission(ResourceType.Organization, Action.Update)
  @ApiOperation({ summary: 'Updates a node’s descriptive fields or status.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
  ): Promise<OrgNode> {
    return this.repo.update(requireSecurity(), id, dto);
  }

  @Post(':id/move')
  // A move mutates an existing node; it does not create one, so 200 rather
  // than the 201 Nest applies to POST by default.
  @HttpCode(HttpStatus.OK)
  @RequirePermission(ResourceType.Organization, Action.Manage)
  @ApiOperation({
    summary: 'Reparents a node and rewrites its subtree path.',
    description:
      'Requires the Manage action rather than Update: moving a node changes the scope of ' +
      'every authorization decision beneath it.',
  })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOrgNodeDto,
  ): Promise<OrgNode> {
    return this.repo.move(requireSecurity(), id, dto.newParentId, dto.reason);
  }
}
