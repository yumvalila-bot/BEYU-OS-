import { Module } from '@nestjs/common';
import { LandController } from './land.controller';
import { LandRepository } from './land.repository';

@Module({
  controllers: [LandController],
  providers: [LandRepository],
  exports: [LandRepository],
})
export class LandModule {}
