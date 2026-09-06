import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsRepository } from './operations.repository';

@Module({
  controllers: [OperationsController],
  providers: [OperationsRepository],
  exports: [OperationsRepository],
})
export class OperationsModule {}
