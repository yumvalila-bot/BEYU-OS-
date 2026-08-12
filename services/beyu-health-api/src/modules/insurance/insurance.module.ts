import { Module } from '@nestjs/common';
import { InsuranceController } from './insurance.controller';
import { InsuranceRepository } from './insurance.repository';
@Module({ controllers: [InsuranceController], providers: [InsuranceRepository], exports: [InsuranceRepository] })
export class InsuranceModule {}
