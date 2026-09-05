import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { ClinicalRepository } from './clinical.repository';
@Module({ controllers: [ClinicalController], providers: [ClinicalRepository], exports: [ClinicalRepository] })
export class ClinicalModule {}
