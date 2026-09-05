import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceRepository } from './compliance.repository';
@Module({ controllers: [ComplianceController], providers: [ComplianceRepository], exports: [ComplianceRepository] })
export class ComplianceModule {}
