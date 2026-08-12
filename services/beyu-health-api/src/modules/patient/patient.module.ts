import { Module } from '@nestjs/common';
import { PatientController } from './patient.controller';
import { PatientRepository } from './patient.repository';
@Module({ controllers: [PatientController], providers: [PatientRepository], exports: [PatientRepository] })
export class PatientModule {}
