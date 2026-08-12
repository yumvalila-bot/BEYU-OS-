import { Body, Controller, Get, Param, Post, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { DocumentsRepository } from './documents.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateDocumentDto { @IsOptional() @IsString() patientId?: string; @IsOptional() @IsString() encounterId?: string; @IsString() documentType!: string; @IsString() title!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() storageKey?: string; @IsOptional() @IsString() mimeType?: string; @IsOptional() @IsNumber() sizeBytes?: number; @IsOptional() @IsString() confidentiality?: string; @IsOptional() @IsArray() tags?: string[]; }

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsRepository) {}
  @Get() @RequirePermissions({ resource: 'documents', action: 'READ' }) async list(@Query('patientId') patientId?: string, @Query('documentType') documentType?: string, @Query('encounterId') encounterId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.docs.list(getSecurityContext()!, { patientId, documentType, encounterId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get(':id') @RequirePermissions({ resource: 'documents', action: 'READ' }) async get(@Param('id') id: string) { return this.docs.getById(getSecurityContext()!, id); }
  @Get(':id/access-log') @RequirePermissions({ resource: 'documents', action: 'READ' }) async accessLog(@Param('id') id: string) { return this.docs.accessLog(getSecurityContext()!, id); }
  @Post() @RequirePermissions({ resource: 'documents', action: 'CREATE' }) async create(@Body() dto: CreateDocumentDto) { return this.docs.create(getSecurityContext()!, dto); }
  @Delete(':id') @RequirePermissions({ resource: 'documents', action: 'DELETE' }) async remove(@Param('id') id: string) { return this.docs.delete(getSecurityContext()!, id); }
}
