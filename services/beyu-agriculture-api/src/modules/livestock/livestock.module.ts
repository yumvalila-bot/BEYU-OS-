import { Module } from '@nestjs/common';
import { LivestockController } from './livestock.controller';
import { LivestockRepository } from './livestock.repository';

@Module({
  controllers: [LivestockController],
  providers: [LivestockRepository],
  exports: [LivestockRepository],
})
export class LivestockModule {}
