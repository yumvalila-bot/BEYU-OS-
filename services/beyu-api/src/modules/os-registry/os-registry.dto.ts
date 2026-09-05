/**
 * OS federation request bodies (spec §69, §70).
 *
 * NOTE: value imports, not `import type`. NestJS resolves the DTO class from
 * `design:paramtypes` metadata; a type-only import erases the class and the
 * ValidationPipe silently stops validating.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OsAttachmentKind, OsCapability, OsStatus } from '@beyu/types';

import { SearchQuery } from '../../common/pagination';

export class ListOsQuery extends SearchQuery {
  @ApiPropertyOptional({ enum: OsStatus })
  @IsOptional()
  @IsEnum(OsStatus)
  status?: OsStatus;

  @ApiPropertyOptional({ enum: OsAttachmentKind })
  @IsOptional()
  @IsEnum(OsAttachmentKind)
  attachmentKind?: OsAttachmentKind;

  @ApiPropertyOptional({ description: 'Sector code, for SECTOR_OS entries.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{2,32}$/)
  sectorCode?: string;
}

export class RegisterOsDto {
  @ApiProperty({
    description:
      'Stable, permanent identifier, e.g. "health-os". It appears in every audit record this OS ever touches and is never reused.',
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{2,47}$/, {
    message: 'osId must be lowercase kebab-case, 3-48 characters, starting with a letter.',
  })
  osId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: OsAttachmentKind,
    description:
      'SECTOR_OS attaches to a Sector LLC. FOUNDATION_OS attaches to BEYU FOUNDATION, which is a sister organization to BEYU HOLDING COMPANY. CORE cannot be registered.',
  })
  @IsEnum(OsAttachmentKind)
  attachmentKind!: OsAttachmentKind;

  @ApiPropertyOptional({
    description: 'Required for SECTOR_OS. Must be absent for FOUNDATION_OS.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{2,32}$/)
  sectorCode?: string;

  @ApiPropertyOptional({ description: 'Semantic version of the OS contract it speaks.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  version?: string;

  @ApiPropertyOptional({
    description: 'HTTPS base URL of the OS API. Required before the OS can be activated.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  apiEndpoint?: string;

  @ApiPropertyOptional({ type: [String], description: 'ISO-3166 alpha-2 codes.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true })
  countryAvailability?: string[];

  @ApiPropertyOptional({ description: 'Why this OS is being attached.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AttachOsDto {
  @ApiProperty({
    description:
      'Organizational node this OS attaches to: a Sector LLC for a SECTOR_OS, the Foundation node for FOUNDATION_OS.',
  })
  @IsUUID()
  nodeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GrantCapabilitiesDto {
  /**
   * Deliberately validated as strings, not `@IsEnum(OsCapability)`.
   *
   * The deny-listed capabilities (DATABASE_READ, WATERFALL_EXECUTE,
   * AUTHORIZATION_BYPASS and the rest) are intentionally NOT members of
   * OsCapability, so an enum validator would reject them with a generic
   * "must be one of the following values" message. That is the wrong answer
   * to an attempted privilege escalation: the operator deserves to be told
   * that the capability is permanently ungrantable and why, and the attempt
   * deserves to be legible in the audit trail. `assertCapabilitiesGrantable`
   * in the repository checks the deny list first and unknown values second,
   * so nothing gets through either way.
   */
  @ApiProperty({
    enum: OsCapability,
    isArray: true,
    description:
      'The complete set of capabilities this OS should hold; it replaces the previous set. Capabilities on the permanent deny list are rejected with an explanation.',
  })
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  capabilities!: string[];

  @ApiPropertyOptional({ description: 'Justification, recorded in the audit chain.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateOsStatusDto {
  @ApiProperty({
    enum: OsStatus,
    description:
      'Target lifecycle state. ACTIVE is reachable only from SECURITY_VALIDATION; RETIRED is terminal.',
  })
  @IsEnum(OsStatus)
  status!: OsStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GrantEventTopicDto {
  @ApiProperty({
    description:
      'A "beyu.*" control plane topic. Inbound "os.*" topics cannot be subscribed to.',
  })
  @IsString()
  @Matches(/^beyu\.[a-z0-9.]+$/, {
    message: 'topic must be a control plane topic of the form "beyu.<domain>.<event>".',
  })
  topic!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
