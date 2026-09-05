import { Module } from '@nestjs/common';
import { AmbulanceController } from './ambulance.controller';
import { AmbulanceRepository } from './ambulance.repository';
@Module({ controllers: [AmbulanceController], providers: [AmbulanceRepository], exports: [AmbulanceRepository] })
export class AmbulanceModule {}
