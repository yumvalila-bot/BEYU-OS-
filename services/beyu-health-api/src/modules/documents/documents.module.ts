import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
@Module({ controllers: [DocumentsController], providers: [DocumentsRepository], exports: [DocumentsRepository] })
export class DocumentsModule {}
