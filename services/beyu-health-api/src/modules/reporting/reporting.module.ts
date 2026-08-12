import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';
import { ReportSchedulerService } from './report-scheduler.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingRepository, ReportingService, ReportSchedulerService],
  exports: [ReportingRepository, ReportingService, ReportSchedulerService],
})
export class ReportingModule {}
