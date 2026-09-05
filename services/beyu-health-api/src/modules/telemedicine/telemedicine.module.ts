import { Module } from '@nestjs/common';
import { TelemedicineController } from './telemedicine.controller';
import { TelemedicineRepository } from './telemedicine.repository';
@Module({ controllers: [TelemedicineController], providers: [TelemedicineRepository], exports: [TelemedicineRepository] })
export class TelemedicineModule {}
