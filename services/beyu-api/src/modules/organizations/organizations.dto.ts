/**
 * Organization request bodies (spec §18).
 *
 * NOTE: value imports, not `import type`. NestJS resolves the DTO class from
 * `design:paramtypes` metadata; a type-only import erases the class and the
 * ValidationPipe silently stops validating.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OrgNodeType } from '@beyu/types';

import { SearchQuery } from '../../common/pagination';

export const ORG_STATUSES = ['ACTIVE', 'INACTIVE', 'DISSOLVED', 'PENDING'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export class ListOrgNodesQuery extends SearchQuery {
  @ApiPropertyOptional({ enum: OrgNodeType })
  @IsOptional()
  @IsEnum(OrgNodeType)
  nodeType?: OrgNodeType;

  @ApiPropertyOptional({ description: 'ISO-3166 alpha-2.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ enum: ORG_STATUSES })
  @IsOptional()
  @IsIn(ORG_STATUSES)
  status?: OrgStatus;
}

export class CreateOrgNodeDto {
  @ApiProperty({ enum: OrgNodeType })
  @IsEnum(OrgNodeType)
  nodeType!: OrgNodeType;

  @ApiProperty({ example: 'BEYU HOLDING COMPANY' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @ApiPropertyOptional({
    description: 'Parent node. Omit only for the root TRUST node.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'ISO-3166 alpha-2. Required for COUNTRY_HOLDING.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be an ISO-3166 alpha-2 code.' })
  countryCode?: string;

  @ApiPropertyOptional({ description: 'Sector code. Required for SECTOR_LLC.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sectorCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateOrgNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @ApiPropertyOptional({ enum: ORG_STATUSES })
  @IsOptional()
  @IsIn(ORG_STATUSES)
  status?: OrgStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * Reparenting is a separate operation from a general update.
 *
 * Moving a node rewrites the materialized path of its entire subtree and can
 * invalidate ownership and governance assumptions, so it must be requested
 * deliberately rather than slipping through as one field of a PATCH.
 */
export class MoveOrgNodeDto {
  @ApiProperty()
  @IsUUID()
  newParentId!: string;

  @ApiProperty({ description: 'Why the node is being moved. Recorded in the audit trail.' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
