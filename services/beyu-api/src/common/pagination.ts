/**
 * Pagination and list envelopes shared by every domain endpoint.
 *
 * Keyset pagination is deliberately NOT used here: the control plane's lists
 * are small (organizational nodes, governance bodies, rule sets) and offset
 * paging keeps the API predictable. Where a list can grow without bound — the
 * audit trail, notification history — the owning module paginates by sequence
 * instead, which is stable under concurrent inserts.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Hard ceiling on page size. A caller asking for more gets this. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export class PaginationQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SearchQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Case-insensitive substring match on the primary name.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function resolveLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE);
}

export function resolveOffset(offset?: number): number {
  if (offset === undefined) return 0;
  return Math.max(0, Math.trunc(offset));
}

export function page<T>(items: T[], total: number, limit?: number, offset?: number): Page<T> {
  return {
    items,
    total,
    limit: resolveLimit(limit),
    offset: resolveOffset(offset),
  };
}
