import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmRepository } from './farm.repository';

@Module({
  controllers: [FarmController],
  providers: [FarmRepository],
  exports: [FarmRepository],
})
export class FarmModule {}
