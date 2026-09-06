import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';

@Module({
  controllers: [ReportingController],
  providers: [ReportingRepository],
})
export class ReportingModule {}
