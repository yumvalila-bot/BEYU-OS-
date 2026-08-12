import { Module } from '@nestjs/common';
import { RadiologyController } from './radiology.controller';
import { RadiologyRepository } from './radiology.repository';
@Module({ controllers: [RadiologyController], providers: [RadiologyRepository], exports: [RadiologyRepository] })
export class RadiologyModule {}
