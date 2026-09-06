import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementRepository } from './procurement.repository';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementRepository],
  exports: [ProcurementRepository],
})
export class ProcurementModule {}
