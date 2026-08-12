import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsEmail, IsOptional, IsString, MinLength, IsArray } from 'class-validator';
import { hashPassword } from '@beyu/security';
import { UserRepository } from './user.repository';
import { getSecurityContext } from '../../core/request-context';
import { DATABASE } from '../../core/database.token';
import { Inject } from '@nestjs/common';
import type { Database } from '../../db/driver';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() displayName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsArray() roles?: string[];
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() facilityId?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('users')
export class UserController {
  constructor(@Inject(DATABASE) private readonly db: Database, private readonly users: UserRepository) {}

  @Get()
  @RequirePermissions({ resource: 'tenant', action: 'MANAGE' })
  async list(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext();
    const lim = Math.min(100, Number(limit ?? 20));
    const off = Math.max(0, Number(offset ?? 0));
    let where = 'WHERE u.deleted_at IS NULL';
    const params: unknown[] = [];
    if (ctx?.tenantId && !ctx.roles.includes('SUPER_ADMIN')) {
      params.push(ctx.tenantId);
      where += ` AND EXISTS (SELECT 1 FROM health_identity.memberships m WHERE m.user_id=u.id AND m.tenant_id=$${params.length})`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (u.display_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    const rows = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.status, u.mfa_enabled, u.created_at FROM health_identity.users u ${where} ORDER BY u.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, lim, off],
    );
    const count = await this.db.query<{ count: string }>(`SELECT count(*)::text as count FROM health_identity.users u ${where}`, params);
    return { data: rows.rows, total: Number(count.rows[0].count), limit: lim, offset: off };
  }

  @Post()
  @RequirePermissions({ resource: 'tenant', action: 'MANAGE' })
  async create(@Body() dto: CreateUserDto) {
    const passwordHash = hashPassword(dto.password);
    const user = await this.users.createUser({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
      roles: dto.roles,
      tenantId: dto.tenantId,
      facilityId: dto.facilityId,
    });
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
