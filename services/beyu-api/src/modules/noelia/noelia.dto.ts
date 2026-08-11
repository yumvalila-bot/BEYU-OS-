/**
 * Noelia request bodies (spec §41, §57).
 *
 * NOTE: value imports, not `import type`. NestJS resolves the DTO class from
 * `design:paramtypes` metadata; a type-only import erases the class and the
 * ValidationPipe silently stops validating.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { Action } from '@beyu/types';

import { PaginationQuery } from '../../common/pagination';
import { RECOMMENDATION_CATEGORIES } from './noelia.repository';

const AGENT_CODE = /^[a-z][a-z0-9-]{2,47}$/;

export class AskNoeliaDto {
  @ApiProperty({
    description:
      'The question. Answered only from records the caller is already authorized to read.',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;

  @ApiPropertyOptional({ description: 'Continues an existing conversation of the caller.' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Agent code, e.g. "noelia-governance".' })
  @IsOptional()
  @IsString()
  @Matches(AGENT_CODE)
  agentCode?: string;
}

export class ProposeRecommendationDto {
  @ApiProperty({ enum: RECOMMENDATION_CATEGORIES })
  @IsIn(RECOMMENDATION_CATEGORIES as unknown as string[])
  category!: (typeof RECOMMENDATION_CATEGORIES)[number];

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Why the change is proposed. Recorded verbatim for the human reviewer.',
    maxLength: 4000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  rationale!: string;

  @ApiProperty({
    description:
      'The change being proposed, as data. Never applied automatically \u2014 a human ' +
      'must accept it and then enact it through the owning domain endpoint.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  proposedAction!: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: Action,
    description: 'The mutation being proposed. Defaults to "update". Reads are not proposals.',
  })
  @IsOptional()
  @IsIn([Action.Create, Action.Update, Action.Delete, Action.Approve, Action.Reject, Action.Execute, Action.Manage])
  action?: Action;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 10000,
    description: 'Confidence in basis points. Ratios are bps throughout BEYU OS.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  confidenceBps?: number;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  impact?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(AGENT_CODE)
  agentCode?: string;
}

export class ReviewRecommendationDto {
  @ApiProperty({
    enum: ['ACCEPTED', 'REJECTED'],
    description:
      'ACCEPTED records that you agree the change should be made. It does NOT make it.',
  })
  @IsIn(['ACCEPTED', 'REJECTED'])
  decision!: 'ACCEPTED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class ListRecommendationsQuery extends PaginationQuery {
  @ApiPropertyOptional({
    enum: ['PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'],
  })
  @IsOptional()
  @IsIn(['PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'])
  status?: string;

  @ApiPropertyOptional({ enum: RECOMMENDATION_CATEGORIES })
  @IsOptional()
  @IsIn(RECOMMENDATION_CATEGORIES as unknown as string[])
  category?: string;
}

export class ListConversationsQuery extends PaginationQuery {}

export class ListActionLogQuery extends PaginationQuery {}
