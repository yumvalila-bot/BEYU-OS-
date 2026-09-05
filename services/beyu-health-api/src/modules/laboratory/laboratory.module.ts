import { Module } from '@nestjs/common';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryRepository } from './laboratory.repository';
@Module({ controllers: [LaboratoryController], providers: [LaboratoryRepository], exports: [LaboratoryRepository] })
export class LaboratoryModule {}
