import { Module } from '@nestjs/common';
import { CropController } from './crop.controller';
import { CropRepository } from './crop.repository';

@Module({
  controllers: [CropController],
  providers: [CropRepository],
  exports: [CropRepository],
})
export class CropModule {}
