import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { AiRepository } from './ai.repository';
import { getSecurityContext } from '../../core/request-context';

class AskNoeliaDto { @IsString() question!: string; @IsOptional() @IsString() patientId?: string; @IsOptional() @IsString() contextType?: string; @IsString() purposeOfUse!: string; }
class CreateRecommendationDto { @IsOptional() @IsString() conversationId?: string; @IsString() resourceType!: string; @IsOptional() @IsString() resourceId?: string; @IsString() actionType!: string; @IsObject() recommendedAction!: any; @IsString() rationale!: string; @IsOptional() @IsString() riskLevel?: string; }
class CreateHiveTaskDto { @IsString() type!: string; @IsString() title!: string; @IsOptional() @IsString() description?: string; @IsString() engine!: string; @IsObject() input!: any; @IsOptional() @IsString() priority?: string; }

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiRepository) {}

  @Post('noelia/ask') @RequirePermissions({ resource: 'ai', action: 'QUERY' })
  async ask(@Body() dto: AskNoeliaDto) { return this.ai.ask(getSecurityContext()!, dto); }

  @Get('noelia/conversations') @RequirePermissions({ resource: 'ai', action: 'QUERY' })
  async conversations(@Query('limit') limit?: string) { return this.ai.conversations(getSecurityContext()!, limit ? Number(limit) : 20); }

  @Get('noelia/conversations/:id') @RequirePermissions({ resource: 'ai', action: 'QUERY' })
  async messages(@Param('id') id: string) { return this.ai.messages(getSecurityContext()!, id); }

  @Post('noelia/recommendations') @RequirePermissions({ resource: 'ai', action: 'RECOMMEND' })
  async createRecommendation(@Body() dto: CreateRecommendationDto) { return this.ai.createRecommendation(getSecurityContext()!, dto); }

  @Post('noelia/recommendations/:id/review') @RequirePermissions({ resource: 'ai', action: 'RECOMMEND' })
  async reviewRecommendation(@Param('id') id: string, @Body() body: { decision: 'APPROVED' | 'REJECTED'; reason?: string }) { return this.ai.reviewRecommendation(getSecurityContext()!, id, body.decision, body.reason); }

  @Get('hive/tasks') @RequirePermissions({ resource: 'ai', action: 'QUERY' })
  async hiveTasks(@Query('status') status?: string) { return this.ai.hiveTasks(getSecurityContext()!, status); }

  @Post('hive/tasks') @RequirePermissions({ resource: 'ai', action: 'RECOMMEND' })
  async createHiveTask(@Body() dto: CreateHiveTaskDto) { return this.ai.createHiveTask(getSecurityContext()!, { type: dto.type, title: dto.title, description: dto.description, engine: dto.engine, input: dto.input, priority: dto.priority ? Number(dto.priority) : 5 }); }
}
