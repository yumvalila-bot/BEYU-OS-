import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { NotificationsRepository } from './notifications.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notif: NotificationsRepository) {}
  @Get() async list(@Query('recipientId') recipientId?: string, @Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.notif.list(getSecurityContext()!, { recipientId, status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Post() async create(@Body() body: { recipientId?: string; recipientContact: string; channel: string; subject?: string; body: string; priority?: string }) { return this.notif.create(getSecurityContext()!, body); }
  @Get('templates') async templates() { return this.notif.templates(getSecurityContext()!); }
}
