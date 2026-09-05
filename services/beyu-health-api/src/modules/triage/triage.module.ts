import { Module } from '@nestjs/common';
import { TriageController } from './triage.controller';
import { TriageRepository } from './triage.repository';
@Module({ controllers: [TriageController], providers: [TriageRepository], exports: [TriageRepository] })
export class TriageModule {}
